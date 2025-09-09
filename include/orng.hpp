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
const eosio::name GOV = eosio::name("orng.wax");

const     uint8_t   REQ_PENDING = 0;
const     uint8_t   REQ_SENT = 1;
const     uint8_t   REQ_DEAD = 2;

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

std::string sha256_to_hex(const eosio::checksum256& sha256) {
    auto data = sha256.extract_as_byte_array();
    return to_hex(data.data(), data.size());
}

static eosio::checksum256 make_msg(eosio::checksum256 seed, eosio::name d, uint64_t n){
    auto sb = seed.extract_as_byte_array();
    std::vector<char> buf(sb.begin(), sb.end());
    uint64_t v = d.value;
    for (int i = 0; i < 8; ++i)
        buf.push_back((v >> (i * 8)) & 0xff);
    for (int i = 0; i < 8; ++i)
        buf.push_back((n >> (i * 8)) & 0xff);
    // std::string msg = to_hex(buf.data(), buf.size());
    return eosio::sha256(buf.data(), buf.size());
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
    [[eosio::action]] void pause(bool paused);

    /**
     * Pauses/Resumes only the requestrand action
     */
    [[eosio::action]] void pauserequest(bool paused);

    /**
     * set arbitrary config with name and value
     */
    [[eosio::action]] void setconfig(eosio::name config, int64_t value);

    /**
     * Ask for a new random value
     *
     * @param assoc_id User custom id to be used in 'receiverand' callback to
     *                 identify the request.
     * @param signing_value Value used to sign the random value
     * @param caller Smart contract acount that implement 'reveiverand' callback
     */
    ACTION requestrand(uint64_t assoc_id, uint64_t signing_value, const eosio::name &caller);

    /**
     * Removes jobs from the jobs table. The Oracle calls on it passing a list
     * of dangling jobs.
     *
     * @param job_ids A vector of jobs IDs to be removed.
     */
    [[eosio::action]] void killjobs(const std::vector<uint64_t> &job_ids);

    /**
     * bans dapp from requesting random values
     * @param dapp account name of dapp
     */
    [[eosio::action]] void ban(const eosio::name &dapp);

    /**
     * unbans dapp from requesting random values
     * @param dapp account name of dapp
     */
    [[eosio::action]] void unban(const eosio::name &dapp);

    // v2 actions
    /**
     * Unstake previously staked WAX tokens
     * @param dapp Account name unstaking tokens
     * @param quantity Amount of WAX to unstake
     */
    [[eosio::action]] void unstake(const eosio::name &dapp, const eosio::asset &quantity);

    /**
     * Set public key for signing
     * @param version Version of the key
     * @param modulus Modulus of the key
     * @param exponent Exponent of the key
     */
    [[eosio::action]] void setpubkey(uint8_t version, const std::string &exponent, const std::string &modulus);

    /**
     * Retire public key
     * @param version Version of the key
     */
    [[eosio::action]] void retirepubkey(uint8_t version);

    /**
     * Set list of oracle accounts
     * @param oracles Vector of oracle account names
     */
    [[eosio::action]] void setoracles(const std::vector<eosio::name> &oracles);

    /**
     * Reset suspension status for an account
     * @param account Account name to reset suspension for
     */
    [[eosio::action]] void resetsuspen(const eosio::name &account);

    /**
     * Set configuration for v2
     * @param fee_per_call Amount of WAX to stake
     * @param strike_max Strike max
     * @param k_calls_per_wax K calls per WAX
     */
    [[eosio::action]] void configv2(const eosio::asset &fee_per_call, uint8_t strike_max, uint8_t k_calls_per_wax, uint64_t treas_hardfloor);

    /**
     * Claim WAX from the treasury
     * @param dapp Account name claiming WAX
     */
    [[eosio::action]] void claim(const eosio::name &oracle);

    /**
     * Submit a part of the random value
     * @param id The id of the request
     * @param ver The version of the key
     * @param sig_i The signature of the part
     */
    [[eosio::action]] void submitpart(eosio::name oracle, uint64_t id, uint8_t ver, std::string sig_i);

    
    /**
     * Set a random value
     * @param id The id of the request
     * @param ver The version of the key
     * @param sig The signature of the part
     */
    [[eosio::action]] void setrand(eosio::name oracle, uint64_t id, uint8_t ver, std::string sig);

    /**
     * Mark a callback as failed and store result for later retrieval
     * @param oracle Oracle calling this action
     * @param id The id of the request
     * @param ver The version of the key
     * @param sig The signature that was computed
     * @param error_message The error encountered when trying to deliver callback
     */
    [[eosio::action]] void markfailed(eosio::name oracle, uint64_t id, uint8_t ver, std::string sig, std::string error_message);

    /**
     * Retry delivery of an undelivered result
     * @param request_id The internal request ID from undelivered table
     */
    [[eosio::action]] void retrydeliver(uint64_t request_id);  

    /**
     * on token transfer
     * Notification handler
     * Stake or deposit WAX tokens to enable RNG requests
     */
    [[eosio::on_notify("*::transfer")]] void receive_token_transfer(eosio::name from, eosio::name to, eosio::asset quantity, std::string memo);

    /**
     * Retrieve undelivered random result for a failed callback
     * @param assoc_id The assoc_id used in the original requestrand call
     */
    [[eosio::action]] void getresult(eosio::name caller, uint64_t assoc_id);

    /**
     * Clean up expired undelivered results
     * @param oracle Oracle calling this action
     * @param batch_size Maximum number of entries to process in this call
     */
    [[eosio::action]] void cleanup(eosio::name oracle, uint64_t batch_size);
private:
    TABLE config_a
    {
        uint64_t name;
        int64_t value;

        uint64_t primary_key() const { return name; }
    };
    using config_table_type = eosio::multi_index<"config.a"_n, config_a>;
    using dappconfig_table_type = eosio::multi_index<"dappconfig.a"_n, config_a>;

    TABLE ban_list_a
    {
        eosio::name dapp;

        uint64_t primary_key() const { return dapp.value; }
    };
    using ban_list_table_type = eosio::multi_index<"banlist.a"_n, ban_list_a>;


    // v2 tables
    struct [[eosio::table]] pubkey
    {
        uint8_t ver;
        uint64_t pubkey_hash_id;
        std::string exponent;
        std::string modulus;
        bool retired = false;
        uint64_t primary_key() const { return ver; }
        uint64_t by_hash_id() const { return pubkey_hash_id; }

    };
    using pkey_table_type = eosio::multi_index<"pubkeys"_n, pubkey,
                        eosio::indexed_by<"byhashid"_n, eosio::const_mem_fun<pubkey, uint64_t, &pubkey::by_hash_id>>>;

    struct [[eosio::table]] orinfo
    {
        eosio::name oracle;
        uint8_t oracle_index = 0;
        uint8_t strikes = 0;
        bool suspended = false;
        uint64_t primary_key() const { return oracle.value; }
    };
    using oracles_table_type = eosio::multi_index<"oracles.a"_n, orinfo>;

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
    using acct_table_type = eosio::multi_index<"acctstate"_n, acctstate>;

    struct [[eosio::table]] treasury
    {
        uint64_t pool_balance = 0;
    };
    using treas_singleton_type = eosio::singleton<"treasury"_n, treasury>;

    struct [[eosio::table]] balrow
    {
        eosio::name oracle;
        eosio::asset unpaid{0, WAX};
        uint64_t primary_key() const { return oracle.value; }
    };
    using bal_table_type = eosio::multi_index<"balances"_n, balrow>;

    struct [[eosio::table]] undelivered
    {
        uint64_t request_id;
        eosio::name dapp;
        uint64_t assoc_id;
        eosio::checksum256 rnd;
        std::string error_message;
        eosio::time_point oracle_reward_deadline;  // deadline for oracle to claim remaining 50%
        uint64_t primary_key() const { return request_id; }
        uint128_t by_dapp_assoc() const { return (uint128_t{dapp.value} << 64) | assoc_id; }
    };
    using undelivered_table_type = eosio::multi_index<"undelivered"_n, undelivered,
        eosio::indexed_by<"bydappassoc"_n, eosio::const_mem_fun<undelivered, uint128_t, &undelivered::by_dapp_assoc>>>;

    struct part
    {
        uint8_t idx;
        std::string sig_i;
    };

    struct [[eosio::table]] request
    {
        uint64_t id;
        eosio::name dapp;
        eosio::checksum256 seed;
        uint8_t ver;
        uint64_t nonce;
        uint64_t assoc_id;
        bool free_call = false;
        eosio::checksum256 rnd;          // final randomness
        uint8_t attempts = 0; // retry counter
        std::vector<part> parts; // optional transparency
        uint64_t primary_key() const { return id; }
    };
    using req_table_type = eosio::multi_index<"reqs"_n, request>;

    config_table_type config_table;
    ban_list_table_type ban_list_table;
    pkey_table_type pkey_table;
    oracles_table_type oracles_table;
    acct_table_type acct_table;
    treas_singleton_type treas_singleton;
    // bal_table_type bal_table;
    req_table_type req_table;

    // Helpers
    bool is_paused() const;
    bool is_paused_request() const;
    void set_config(uint64_t name, int64_t value);
    int64_t get_config(uint64_t name, int64_t default_value) const;
    int64_t get_dapp_config(eosio::name dapp, uint64_t name, int64_t default_value) const;
    uint64_t generate_next_index();
    uint64_t hash_to_int(const eosio::checksum256 &value);

    void _refill(acct_table_type::const_iterator it);
    void _reward_oracles(eosio::asset qty);
    void _stake(const eosio::name &dapp, const eosio::asset &quantity);
    void _deposit(const eosio::name &dapp, const eosio::asset &quantity);
    void _treasury_deposit(const eosio::asset &quantity);
    
    // Returns computed randomness if validation succeeds, empty checksum256 if oracle should get strike
    eosio::checksum256 _validate_and_compute_rnd(eosio::name oracle, uint64_t id, uint8_t ver, const std::string& sig);
    
    // Clean up expired undelivered results (helper function)
    void _cleanup_expired_results(uint64_t batch_size);
    
    

}; // CONTRACT orng
