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
#include <eosio/asset.hpp>
#include <eosio/time.hpp>
#include <eosio/crypto.hpp>
#include <eosio/multi_index.hpp>
#include <stdint.h>
#include <string>
#include <vector>

const eosio::symbol WAX = eosio::symbol("WAX", 8);
const eosio::name GOV = eosio::name("orng.gov");

static eosio::checksum256 make_msg(eosio::checksum256 seed, eosio::name d, uint64_t n)
{
    auto sb = seed.extract_as_byte_array();
    std::vector<char> buf(sb.begin(), sb.end());
    uint64_t v = d.value;
    for (int i = 0; i < 8; ++i)
        buf.push_back((v >> (i * 8)) & 0xff);
    for (int i = 0; i < 8; ++i)
        buf.push_back((n >> (i * 8)) & 0xff);
    return eosio::sha256(buf.data(), buf.size());
}


template<typename CharT>
static std::string to_hex(const CharT* d, uint32_t s) {
  std::string r;
  const char* to_hex="0123456789abcdef";
  uint8_t* c = (uint8_t*)d;
  for( uint32_t i = 0; i < s; ++i ) {
    (r += to_hex[(c[i] >> 4)]) += to_hex[(c[i] & 0x0f)];
  }
  return r;
}



CONTRACT orng : public eosio::contract
{
public:
    orng(const eosio::name &receiver,
         const eosio::name &code,
         const eosio::datastream<const char *> &ds);

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
     * set arbitrary config with name and value
     */
    ACTION setconfig(eosio::name config, int64_t value);
    using setconfig_action = eosio::action_wrapper<"setconfig"_n, &orng::setconfig>;

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
    ACTION setbwpayer(const eosio::name &payee, const eosio::name &payer);
    using setbwpayer_action = eosio::action_wrapper<"setbwpayer"_n, &orng::setbwpayer>;

    /**
     * Payer accept to pay bandwith for contract
     *
     * @param payee name of contract receive RNG result
     * @param payer account name pay for bandwidth
     * @param accepted accept to pay for bandwidth or not
     */
    ACTION acceptbwpay(const eosio::name &payee, const eosio::name &payer, bool accepted);
    using acceptbwpay_action = eosio::action_wrapper<"acceptbwpay"_n, &orng::acceptbwpay>;

    /**
     * Ask for a new random value
     *
     * @param assoc_id User custom id to be used in 'receiverand' callback to
     *                 identify the request.
     * @param signing_value Value used to sign the random value
     * @param caller Smart contract acount that implement 'reveiverand' callback
     */
    // ACTION requestrand(uint64_t assoc_id, uint64_t signing_value, const eosio::name &caller);
    // using requestrand_action = eosio::action_wrapper<"requestrand"_n, &orng::requestrand>;

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
    // ACTION setrand(uint64_t job_id, const std::string &random_value);
    // using setrand_action = eosio::action_wrapper<"setrand"_n, &orng::setrand>;

    /**
     * Removes jobs from the jobs table. The Oracle calls on it passing a list
     * of dangling jobs.
     *
     * @param job_ids A vector of jobs IDs to be removed.
     */
    ACTION killjobs(const std::vector<uint64_t> &job_ids);
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
    ACTION setsigpubkey(uint64_t id, const std::string &exponent, const std::string &modulus);
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
    ACTION dapperror(eosio::name dapp, uint64_t job_id, const std::string message);
    using dapperror_action = eosio::action_wrapper<"dapperror"_n, &orng::dapperror>;

    /**
     * adjusts the number of errors we hold per dapp in the queue before rotating out the oldest one
     * @param dapp account name of dapp
     * @param queue_size number of error message store in table
     */
    ACTION seterrorsize(const eosio::name &dapp, uint64_t queue_size);
    using seterrorqsize_action = eosio::action_wrapper<"seterrorsize"_n, &orng::seterrorsize>;

    /**
     * sets the maximium number of jobs allowed for a specific dapp
     * @param dapp account name of dapp
     * @param max_jobs max number of jobs we will hold in queue for the dapp
     */
    ACTION setmaxjobs(const eosio::name &dapp, uint64_t max_jobs);
    using setmaxjobs_action = eosio::action_wrapper<"setmaxjobs"_n, &orng::setmaxjobs>;

    /**
     * bans dapp from requesting random values
     * @param dapp account name of dapp
     */
    ACTION ban(const eosio::name &dapp);
    using ban_action = eosio::action_wrapper<"ban"_n, &orng::ban>;

    /**
     * unbans dapp from requesting random values
     * @param dapp account name of dapp
     */
    ACTION unban(const eosio::name &dapp);
    using unban_action = eosio::action_wrapper<"unban"_n, &orng::unban>;

    // v2 actions
    /**
     * Stake WAX tokens to enable RNG requests
     * @param dapp Account name staking tokens
     * @param quantity Amount of WAX to stake
     */
    ACTION stake(const eosio::name &dapp, const eosio::asset &quantity);
    using stake_action = eosio::action_wrapper<"stake"_n, &orng::stake>;

    /**
     * Unstake previously staked WAX tokens
     * @param dapp Account name unstaking tokens
     * @param quantity Amount of WAX to unstake
     */
    ACTION unstake(const eosio::name &dapp, const eosio::asset &quantity);
    using unstake_action = eosio::action_wrapper<"unstake"_n, &orng::unstake>;

    /**
     * Deposit WAX tokens to pay for RNG requests
     * @param dapp Account name depositing tokens
     * @param quantity Amount of WAX to deposit
     */
    ACTION deposit(const eosio::name &dapp, const eosio::asset &quantity);
    using deposit_action = eosio::action_wrapper<"deposit"_n, &orng::deposit>;

    /**
     * Set public key for signing
     * @param version Version of the key
     * @param modulus Modulus of the key
     * @param exponent Exponent of the key
     */
    ACTION setpubkey(uint8_t version, const std::string &exponent, const std::string &modulus);
    using setpubkey_action = eosio::action_wrapper<"setpubkey"_n, &orng::setpubkey>;

    /**
     * Set list of oracle accounts
     * @param oracles Vector of oracle account names
     */
    ACTION setoracles(const std::vector<eosio::name> &oracles);
    using setoracles_action = eosio::action_wrapper<"setoracles"_n, &orng::setoracles>;

    /**
     * Reset suspension status for an account
     * @param account Account name to reset suspension for
     */
    ACTION resetsuspen(const eosio::name &account);
    using resetsuspen_action = eosio::action_wrapper<"resetsuspen"_n, &orng::resetsuspen>;

    /**
     * Set configuration for v2
     * @param fee_per_call Amount of WAX to stake
     * @param strike_max Strike max
     * @param k_calls_per_wax K calls per WAX
     */
    ACTION configv2(const eosio::asset &fee_per_call, uint8_t strike_max, uint8_t k_calls_per_wax);
    using configv2_action = eosio::action_wrapper<"configv2"_n, &orng::configv2>;

    /**
     * Claim WAX from the treasury
     * @param dapp Account name claiming WAX
     */
    ACTION claim(const eosio::name &oracle);
    using claim_action = eosio::action_wrapper<"claim"_n, &orng::claim>;

    /**
     * Submit a part of the random value
     * @param id The id of the request
     * @param ver The version of the key
     * @param idx The index of the part
     * @param sig_i The signature of the part
     */
    ACTION submitpart(uint64_t id, uint8_t ver, uint8_t idx, const eosio::checksum256 &sig_i);
    using submitpart_action = eosio::action_wrapper<"submitpart"_n, &orng::submitpart>;

    /**
     * Request a random value
     * @param dapp Account name requesting random value
     * @param seed Seed value for random number generation
     * @param assoc_id User custom id to be used in 'receiverand' callback to identify the request
     */
    ACTION requestrand(eosio::name dapp, eosio::checksum256 seed, uint64_t assoc_id);
    using requestrand_action = eosio::action_wrapper<"requestrand"_n, &orng::requestrand>;

    /**
     * Set a random value
     * @param id The id of the request
     * @param ver The version of the key
     * @param sig The signature of the part
     */
    ACTION setrand(uint64_t id, uint8_t ver, std::string sig);  
    using setrand_action = eosio::action_wrapper<"setrand"_n, &orng::setrand>;

    // Implementation
private:
    TABLE config_a
    {
        uint64_t name;
        int64_t value;

        uint64_t primary_key() const { return name; }
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

    TABLE jobs_a
    {
        uint64_t id;
        uint64_t assoc_id;
        uint64_t signing_value;
        eosio::name caller;

        uint64_t primary_key() const { return id; }
    };
    using jobs_table_type = eosio::multi_index<"jobs.a"_n, jobs_a>;

    TABLE jobs_count_a
    {
        eosio::name dapp;
        uint64_t num_jobs_in_q;

        uint64_t primary_key() const { return dapp.value; }
    };
    using jobs_count_table_type = eosio::multi_index<"jobscount.a"_n, jobs_count_a>;

    TABLE max_jobs_a
    {
        eosio::name dapp;
        uint64_t max_jobs_allowed;

        uint64_t primary_key() const { return dapp.value; }
    };
    using max_jobs_table_type = eosio::multi_index<"maxjobs.a"_n, max_jobs_a>;

    TABLE ban_list_a
    {
        eosio::name dapp;

        uint64_t primary_key() const { return dapp.value; }
    };
    using ban_list_table_type = eosio::multi_index<"banlist.a"_n, ban_list_a>;

    // scope by public_key hash
    TABLE signvals_a
    {
        uint64_t signing_value;

        uint64_t primary_key() const { return signing_value; }
    };
    using signvals_table_type = eosio::multi_index<"signvals.a"_n, signvals_a>;

    // deprecated table
    TABLE sigpubkey_a
    {
        uint64_t id;
        std::string exponent;
        std::string modulus;

        uint64_t primary_key() const { return id; }
    };
    using sigpubkey_table_type_depracated = eosio::multi_index<"sigpubkey.a"_n, sigpubkey_a>;

    TABLE sigpubkey_b
    {
        uint64_t id;
        uint64_t pubkey_hash_id;
        std::string exponent;
        std::string modulus;
        uint64_t last = 0; // the last job id uses that key

        uint64_t primary_key() const { return id; }
        uint64_t by_hash_id() const { return pubkey_hash_id; }
        uint64_t by_last() const { return last; }
    };
    using sigpubkey_table_type = eosio::multi_index<"sigpubkey.b"_n, sigpubkey_b,
                                                    eosio::indexed_by<"byhashid"_n, eosio::const_mem_fun<sigpubkey_b, uint64_t, &sigpubkey_b::by_hash_id>>,
                                                    eosio::indexed_by<"bylast"_n, eosio::const_mem_fun<sigpubkey_b, uint64_t, &sigpubkey_b::by_last>>>;

    TABLE bwpayers_a
    {
        eosio::name payee;
        eosio::name payer;
        bool accepted = false;

        uint64_t primary_key() const { return payee.value; }
    };
    using bwpayers_table_type = eosio::multi_index<"bwpayers.a"_n, bwpayers_a>;

    TABLE errorlog_a
    {
        uint64_t id;
        eosio::name dapp;
        uint64_t assoc_id;
        std::string message;

        uint64_t primary_key() const { return id; }
    };
    using errorlog_table_type = eosio::multi_index<"errorlog.a"_n, errorlog_a>;

    // v2 tables
    struct [[eosio::table]] pubkey
    {
        uint8_t ver;
        std::string exponent;
        std::string modulus;
        bool retired = false;
        uint64_t primary_key() const { return ver; }
    };
    using pkey_table = eosio::multi_index<"pubkeys"_n, pubkey>;

    struct [[eosio::table]] orinfo
    {
        eosio::name oracle;
        uint8_t strikes = 0;
        bool suspended = false;
        uint64_t primary_key() const { return oracle.value; }
    };
    using oracles_table = eosio::multi_index<"oracles"_n, orinfo>;

    struct [[eosio::table]] acctstate
    {
        eosio::name dapp;
        eosio::asset stake{0, WAX};
        uint32_t credits = 0;
        eosio::asset fee_balance{0, WAX};
        uint64_t last_nonce = 0;
        eosio::time_point_sec last_update;
        uint64_t primary_key() const { return dapp.value; }
    };
    using acct_table = eosio::multi_index<"acctstate"_n, acctstate>;

    struct [[eosio::table]] treasury
    {
        eosio::asset pool_balance{0, WAX};
    };
    using treas_singleton = eosio::singleton<"treasury"_n, treasury>;

    struct [[eosio::table]] balrow
    {
        eosio::name oracle;
        eosio::asset unpaid{0, WAX};
        uint64_t primary_key() const { return oracle.value; }
    };
    using bal_table = eosio::multi_index<"balances"_n, balrow>;

    struct part
    {
        uint8_t idx;
        eosio::checksum256 sig_i;
    };

    struct [[eosio::table]] request
    {
        uint64_t id;
        eosio::name dapp;
        eosio::checksum256 seed;
        uint8_t ver;
        uint64_t nonce;
        uint64_t assoc_id;
        std::vector<part> parts; // optional transparency
        uint64_t primary_key() const { return id; }
    };
    using req_table = eosio::multi_index<"reqs"_n, request>;

    config_table_type config_table;
    jobs_table_type jobs_table;
    sigpubkey_table_type sigpubkey_table;
    sigpubconfig_table_type sigpubconfig_table;
    bwpayers_table_type bwpayers_table;
    signvals_table_type signvals_table_v1_support;
    sigpubkey_table_type_depracated sigpubkey_table_v1;
    jobs_count_table_type jobs_count_table;
    max_jobs_table_type max_jobs_table;
    ban_list_table_type ban_list_table;

    // Helpers
    bool is_paused() const;
    bool is_paused_request() const;
    void set_config(uint64_t name, int64_t value);
    int64_t get_config(uint64_t name, int64_t default_value) const;
    int64_t get_dapp_config(eosio::name dapp, uint64_t name, int64_t default_value) const;
    uint64_t generate_next_index();
    uint64_t hash_to_int(const eosio::checksum256 &value);
    uint64_t update_current_public_key(uint64_t job_id);
    uint64_t get_current_public_key();
    uint64_t get_job_count(const eosio::name &dapp) const;
    void inc_job_count(const eosio::name &dapp);
    void dec_job_count(const eosio::name &dapp);
    uint64_t get_max_jobs(const eosio::name &dapp) const;

    void _ensure_not_paused() const { eosio::check(!is_paused(), "paused"); }
    void _ensure_req() const { eosio::check(!is_paused_request(), "req paused"); }
    void _refill(acct_table::const_iterator it);
    void _reward_oracles(eosio::asset qty);

}; // CONTRACT orng
