// MIT License
//
// Copyright (c) 2019 worldwide-asset-exchange
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>
#include <eosio/time.hpp>
#include <stdint.h>
#include <string>
#include <vector>

CONTRACT orng: public eosio::contract {
public:
    orng(const eosio::name& receiver,
         const eosio::name& code,
         const eosio::datastream<const char*>& ds);

    /**
     * Pauses/Resumes the smart contract - all actions but pause
     */
    ACTION pause(bool paused);
    using pause_action = eosio::action_wrapper<"pause"_n, &orng::pause>;

    /**
     * Pauses/Resumes only the requestrand action
     */
    ACTION pauserequest(bool paused);
    using pauserequest_action = eosio::action_wrapper<"pauserequest"_n, &orng::pauserequest>;

    /**
     * Gets the smart contract version
     */
    ACTION version();
    using version_action = eosio::action_wrapper<"version"_n, &orng::version>;

    /**
     * Set bandwidth payer for dapp
     *
     * @param payee name of contract receive RNG result
     * @param payer account name pay for bandwidth
     */
    ACTION setbwpayer(const eosio::name& payee, const eosio::name& payer);
    using setbwpayer_action = eosio::action_wrapper<"setbwpayer"_n, &orng::setbwpayer>;

    /**
     * Payer accept to pay bandwith for contract
     *
     * @param payee name of contract receive RNG result
     * @param payer account name pay for bandwidth
     * @param accepted accept to pay for bandwidth or not
     */
    ACTION acceptbwpay(const eosio::name& payee, const eosio::name& payer, bool accepted);
    using acceptbwpay_action = eosio::action_wrapper<"acceptbwpay"_n, &orng::acceptbwpay>;

    /**
     * Ask for a new random value
     *
     * @param assoc_id User custom id to be used in 'receiverand' callback to
     *                 identify the request.
     * @param signing_value Value used to sign the random value
     * @param caller Smart contract acount that implement 'reveiverand' callback
     */
    ACTION requestrand(uint64_t assoc_id, uint64_t signing_value, const eosio::name& caller);
    using requestrand_action = eosio::action_wrapper<"requestrand"_n, &orng::requestrand>;

    /**
     * Sets the signing values in the signing values table under self scope according to the v1 version of this contract. Maintains backward compatibility
     *
     * @param signing_value The signing value to record in the signing table under self scope
     * @note this contract requires authorization of the oraclev1.wax account which pays for the RAM needed to record these values being tracked in legacy form
     */
    ACTION v1rrcompat(uint64_t signing_value);
    using v1rrcompat_action = eosio::action_wrapper<"v1rrcompat"_n, &orng::v1rrcompat>;

    /**
     * Used by the oracle to set the generated random value
     */
    ACTION setrand(uint64_t job_id, const std::string& random_value);
    using setrand_action = eosio::action_wrapper<"setrand"_n, &orng::setrand>;

    /**
     * Removes jobs from the jobs table. The Oracle calls on it passing a list
     * of dangling jobs.
     *
     * @param job_ids A vector of jobs IDs to be removed.
     */
    ACTION killjobs(const std::vector<uint64_t>& job_ids);
    using killjobs_action = eosio::action_wrapper<"killjobs"_n, &orng::killjobs>;

    /**
     * Sets the public key used by the oracle to sign tx ids. Public keys are
     * stored in their raw RSA exponent and modulus form as hexadecimal integers
     * represented by strings of hex characters.
     *
     * openssl rsa -in TestData/wax.4096.public.pem -pubin -text -noout
     *
     * @param exponent The public key exponent
     * @param modulus The public key modulus
     * @note it uses the integer of hash modulus as a table scope
     */
    ACTION setsigpubkey(uint64_t id, const std::string& exponent, const std::string& modulus);
    using setsigpubkey_action = eosio::action_wrapper<"setsigpubkey"_n, &orng::setsigpubkey>;

    /**
    * @dev clean the signing values from dapp which has been signed with no longer used public-key.
    * @param scope the scope of table.
    * @param rows_num The number of rows that be expected to be removed
    * @note it does not allow to removing the signing values which have scope is the id of active public-key
    * @note it also removes signing values that were saved under self scope which are inserted to support v1 rng dependant contracts
    */
    ACTION cleansigvals(uint64_t scope, uint64_t rows_num);
    using cleansigvals_action = eosio::action_wrapper<"cleansigvals"_n, &orng::cleansigvals>;

    ACTION setchance(uint64_t chance_to_switch);
    using setchance_action = eosio::action_wrapper<"setchance"_n, &orng::setchance>;

    /**
    * log the error occur when setrand for dapp
    * @param dapp account name of dapp
    * @param message error message
    * @param assoc_id assoc_id that error happen
    */
    ACTION dapperror(uint64_t job_id, const std::string message);
    using dapperror_action = eosio::action_wrapper<"dapperror"_n, &orng::dapperror>;

    /**
    * adjusts the number of errors we hold per dapp in the queue before rotating out the oldest one
    * @param dapp account name of dapp
    * @param queue_size number of error message store in table
    */
    ACTION seterrorsize(const eosio::name& dapp, uint64_t queue_size);
    using seterrorqsize_action = eosio::action_wrapper<"seterrorsize"_n, &orng::seterrorsize>;

// Implementation
private:
    TABLE config_a {
        uint64_t name;
        int64_t  value;

        auto primary_key() const { return name; }
    };
    using config_table_type = eosio::multi_index<"config.a"_n, config_a>;
    using dappconfig_table_type = eosio::multi_index<"dappconfig.a"_n, config_a>;

    // Config table
    TABLE sigpubkey_config
    {
        uint64_t chance_to_switch;
        uint64_t active_key_index;
        uint64_t available_key_counter;
    };
    using sigpubconfig_table_type = eosio::singleton<"pubconfig.a"_n, sigpubkey_config>;
    using sigpubconfig_table_type_abi = eosio::multi_index<"pubconfig.a"_n, sigpubkey_config>; // generate abi file

    TABLE jobs_a {
        uint64_t    id;
        uint64_t    assoc_id;
        uint64_t    signing_value;
        eosio::name caller;

        auto primary_key() const { return id; }
    };
    using jobs_table_type = eosio::multi_index<"jobs.a"_n, jobs_a>;

    // scope by public_key hash
    TABLE signvals_a {
        uint64_t signing_value;

        auto primary_key() const { return signing_value; }
    };
    using signvals_table_type = eosio::multi_index<"signvals.a"_n, signvals_a>;

    // deprecated table
    TABLE sigpubkey_a {
        uint64_t    id;
        std::string exponent;
        std::string modulus;

        auto primary_key() const { return id; }
    };
    using sigpubkey_table_type_depracated = eosio::multi_index<"sigpubkey.a"_n, sigpubkey_a>;

    TABLE sigpubkey_b {
        uint64_t    id;
        uint64_t    pubkey_hash_id;
        std::string exponent;
        std::string modulus;
        uint64_t    last = 0; // the last job id uses that key

        auto primary_key() const { return id; }
        uint64_t by_hash_id() const { return pubkey_hash_id; }
        uint64_t by_last() const { return last; }
    };
    using sigpubkey_table_type = eosio::multi_index<"sigpubkey.b"_n, sigpubkey_b,
                                eosio::indexed_by<"byhashid"_n, eosio::const_mem_fun<sigpubkey_b, uint64_t, &sigpubkey_b::by_hash_id>>,
                                eosio::indexed_by<"bylast"_n, eosio::const_mem_fun<sigpubkey_b, uint64_t, &sigpubkey_b::by_last>>>;

    TABLE bwpayers_a {
        eosio::name payee;
        eosio::name payer;
        bool        accepted = false;

        auto primary_key() const { return payee.value; }
    };
    using bwpayers_table_type = eosio::multi_index<"bwpayers.a"_n, bwpayers_a>;

    TABLE errorlog_a {
        uint64_t    id;
        eosio::name dapp;
        uint64_t    assoc_id;
        std::string message;

        auto primary_key() const { return id; }
    };
    using errorlog_table_type = eosio::multi_index<"errorlog.a"_n, errorlog_a>;

    config_table_type       config_table;
    jobs_table_type         jobs_table;
    sigpubkey_table_type    sigpubkey_table;
    sigpubconfig_table_type sigpubconfig_table;
    bwpayers_table_type     bwpayers_table;
    signvals_table_type     signvals_table_v1_support;
    sigpubkey_table_type_depracated sigpubkey_table_v1;

    // Helpers
    bool is_paused() const;
    bool is_paused_request() const;
    void set_config(uint64_t name, int64_t value);
    int64_t get_config(uint64_t name, int64_t default_value) const;
    int64_t get_dapp_config(eosio::name dapp, uint64_t name, int64_t default_value) const;
    uint64_t generate_next_index();
    uint64_t hash_to_int(const eosio::checksum256& value);
    uint64_t update_current_public_key(uint64_t job_id);
    uint64_t get_current_public_key();

}; // CONTRACT orng
