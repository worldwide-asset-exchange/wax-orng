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

#include "orng.hpp"

#include <eosio/check.hpp>
#include <eosio/crypto.hpp>
#include <eosio/print.hpp>
#include <eosio/transaction.hpp>

#include <tuple>

using namespace eosio;
using std::string;

#define DEFAULT_FREE_MAX_JOBS 100

static constexpr uint64_t paused_request_row                    = "pauserequest"_n.value; // pause only requestrand action
static constexpr uint64_t paused_index                          = "paused"_n.value;       // pause all actions except pause
static constexpr uint64_t request_id_index                      = "requestindex"_n.value; // request increment id
static constexpr uint64_t free_max_jobs                         = "freemaxjobs"_n.value;  // maximum number of jobs to queue per dapp for the free tier
// v2 config
static constexpr uint64_t fee_per_call_index                    = "feepercall"_n.value;  // fee per random number request
static constexpr uint64_t strikes_max_index                     = "strikesmax"_n.value;  // maximum number of strikes before oracle suspension
static constexpr uint64_t k_calls_per_wax_index                 = "kcallsperwax"_n.value; // number of calls allowed per WAX staked
static constexpr uint64_t active_ver_index                      = "activever"_n.value;   // active version of the public key
static constexpr uint64_t treas_hardfloor_multiplier_index      = "treasfloor"_n.value;  // multiplier for the treasury balance
static constexpr uint64_t callback_retries_index                = "callbackret"_n.value; // number of callback retries (default 2)
static constexpr uint64_t oracle_reward_deadline_index          = "oraclereward"_n.value; // oracle reward deadline in seconds (default 7 days)

const name v1_ram_account                                       = "oraclev1.wax"_n;

orng::orng(const name& receiver,
           const name& code,
           const datastream<const char*>& ds)
    : contract(receiver, code, ds)
    , config_table(receiver, receiver.value)
    , ban_list_table(receiver, receiver.value)
    , pkey_table(receiver, receiver.value) 
    , oracles_table(receiver, receiver.value)
    , treas_singleton(receiver, receiver.value)
    , req_table(receiver, receiver.value)
    , acct_table(receiver, receiver.value)
    {
}

ACTION orng::pause(bool paused) {
    require_auth({get_self(), "pause"_n});
    set_config(paused_index, uint64_t(paused));
}

ACTION orng::pauserequest(bool paused) {
    require_auth({get_self(), "pause"_n});
    set_config(paused_request_row, uint64_t(paused));
}

ACTION orng::setconfig(eosio::name config, int64_t value) {
    require_auth(get_self());
    set_config(config.value, value);
}


//v2
[[eosio::on_notify("*::transfer")]]
void orng::receive_token_transfer(eosio::name from, eosio::name to, eosio::asset quantity, std::string memo){
  if (to != get_self()) {
    return;
  }

  check(get_first_receiver() == name("eosio.token"), "only support eosio.token");
  check(quantity.symbol == WAX, "only support WAXP token");

  if (memo == "stake") {
    _stake(from, quantity);
  } else if (memo == "deposit") {
    _deposit(from, quantity);
  } else if (memo == "treasury") {
    _treasury_deposit(quantity);
  } else {
    check(false, "only support staking or deposit");
  }
}

void orng::_refill(acct_table_type::const_iterator it){
    auto k_calls_per_wax = get_config(k_calls_per_wax_index, 3);
    uint64_t maxc = it->stake.amount * k_calls_per_wax / pow(10, WAX.precision());
    uint64_t  dt = (current_time_point().sec_since_epoch() - it->last_update.sec_since_epoch());
    uint64_t add = dt * maxc / 3600;
    acct_table.modify(it, same_payer, [&](auto& r) {
        r.credits = std::min(r.credits + add, maxc);
        r.last_update = time_point_sec(current_time_point());
    });
}

/* stake / unstake / deposit */
void orng::_stake(const eosio::name &dapp, const eosio::asset &quantity){
    eosio::check(!is_paused(), "paused");
    check(quantity.symbol == WAX && quantity.amount > 0, "invalid quantity");
    auto it = acct_table.find(dapp.value);
    auto amount = quantity.amount;
    if(it == acct_table.end()) 
        acct_table.emplace(_self, [&](auto&r){
            r.dapp = dapp;
            r.stake = quantity;
            r.last_update = time_point_sec(current_time_point());
        });
    else{ 
        _refill(it); 
        acct_table.modify(it, get_self(), [&](auto&r){
            r.stake += quantity;
        }); 
    }
}
void orng::unstake(const eosio::name& dapp, const eosio::asset& quantity) {
    eosio::check(!is_paused(), "paused");
    require_auth(dapp);
    
    auto it = acct_table.require_find(dapp.value, "no stake found");
    _refill(it);
    check(it->stake >= quantity, "exceed amount");
    
    acct_table.modify(it, same_payer, [&](auto& r) { r.stake -= quantity; });
    
    action{{get_self(), "active"_n},
            "eosio.token"_n,
            "transfer"_n,
            std::make_tuple(get_self(), dapp, quantity, string("unstake"))}
        .send();
}

void orng::_deposit(const eosio::name& dapp, const eosio::asset& quantity) {
    eosio::check(!is_paused(), "paused");
    require_auth(dapp);
    check(quantity.symbol == WAX && quantity.amount > 0, "invalid quantity");
    auto it = acct_table.find(dapp.value);
    if (it == acct_table.end())
        acct_table.emplace(get_self(), [&](auto& r) {
        r.dapp = dapp;
        r.fee_balance = quantity;
        r.last_update = time_point_sec(current_time_point());
        });
    else{
        acct_table.modify(it, get_self(), [&](auto& r) { 
            r.fee_balance += quantity; 
        });
    }
}

void orng::_treasury_deposit(const eosio::asset &quantity) {
    check(quantity.symbol == WAX && quantity.amount > 0, "invalid quantity");
    // check if treasury exists
    if (!treas_singleton.exists()) {
        treasury treas; 
        treas.pool_balance = quantity.amount;
        treas_singleton.set(treas, _self);
    }else{
        auto it = treas_singleton.get();
        it.pool_balance += quantity.amount;
        treas_singleton.set(it, _self);
    }
}

/* reward split */
void orng::_reward_oracles(asset qty) {
    // oracles_table_type ot(get_self(), get_self().value);
    auto itr = oracles_table.begin();
    if (itr == oracles_table.end()) return;
    int64_t oracle_count = 0;
    for (auto it = oracles_table.begin(); it != oracles_table.end(); ++it) {
        oracle_count++;
    }
    if (oracle_count > 0){
        asset each{qty.amount / oracle_count, WAX};
        bal_table_type bt(get_self(), get_self().value);
        for (auto& o : oracles_table) {
            auto it = bt.find(o.oracle.value);
            if (it == bt.end()){
                bt.emplace(get_self(), [&](auto& r) {
                    r.oracle = o.oracle;
                    r.unpaid = each;
                });
            }else{
                bt.modify(it, same_payer, [&](auto& r) { r.unpaid += each; });
            }
        }
    }
}

void orng::claim(const eosio::name& oracle) {
    eosio::check(!is_paused(), "paused");
    require_auth(oracle);
    bal_table_type bt(get_self(), get_self().value);
    auto it = bt.require_find(oracle.value, "no balance");
    check(it->unpaid.amount > 0, "zero balance");
    asset pay = it->unpaid;
    bt.modify(it, same_payer, [&](auto& r) { r.unpaid.amount = 0; });
    action{{get_self(), "active"_n},
            "eosio.token"_n,
            "transfer"_n,
            std::make_tuple(get_self(), oracle, pay, string("rng reward"))}
        .send();
}

void orng::setpubkey(uint8_t version, const std::string &exponent, const std::string &modulus)
{
    require_auth(GOV);
    check(!is_paused(), "Contract is paused");

    check(modulus.size() > 0, "modulus must have non-zero length");
    check(modulus[0] != '0', "modulus must have leading zeroes stripped");
    
    auto pubkey_hash_id = hash_to_int(sha256(const_cast<char*>(modulus.c_str()), modulus.size()));
    auto byhash_idx = pkey_table.get_index<"byhashid"_n>();
    auto byhash_itr = byhash_idx.find(pubkey_hash_id);
    check(byhash_itr == byhash_idx.end(), "public key already exist");

    auto it = pkey_table.find(version);
    check(it == pkey_table.end(), "key with this version has already existed");

    auto next_ver = pkey_table.begin() == pkey_table.end() ? 1 : std::prev(pkey_table.end())->ver + 1;
    check(version == next_ver, "version must increment by 1");

    pkey_table.emplace(get_self(), [&](auto &r){ 
                r.ver=version;
                r.pubkey_hash_id = pubkey_hash_id;
                r.modulus=modulus;
                r.exponent=exponent; 
            });
    set_config(active_ver_index, version);
}

void orng::retirepubkey(uint8_t version){
    require_auth(GOV);
    auto it = pkey_table.require_find(version, "key not found");
    pkey_table.modify(it, same_payer, [&](auto &r){
        r.retired = true;
    });
}

void orng::setoracles(const std::vector<eosio::name> &oracles){
    require_auth(GOV); 
     // Clear existing oracles
    auto it = oracles_table.begin();
    while(it != oracles_table.end()) {
        it = oracles_table.erase(it);
    }
    // Add new oracles with auto-populated index
    uint8_t index = 1;
    for(auto n:oracles) {
        oracles_table.emplace(get_self(),[&](auto&r){
             r.oracle=n;
             r.oracle_index=index;
        });
        index++;
    }
}

void orng::resetsuspen(const eosio::name &oracle)
{
    require_auth(GOV);
    oracles_table_type ot(get_self(), get_self().value);
    auto it = ot.require_find(oracle.value, "unknown oracle");
    ot.modify(it, same_payer, [&](auto &r){ 
        r.strikes=0;
        r.suspended=false; 
    });
}

void orng::configv2(const eosio::asset &fee_per_call, uint8_t strike_max, uint8_t k_calls_per_wax, uint64_t treas_hardfloor){
    require_auth(get_self());
    set_config(fee_per_call_index, fee_per_call.amount);
    set_config(strikes_max_index, strike_max);
    set_config(k_calls_per_wax_index, k_calls_per_wax);
    set_config(treas_hardfloor_multiplier_index, treas_hardfloor);
}

/* submitpart (store only) */
void orng::submitpart(name oracle, uint64_t id, uint8_t ver, string sig_i) {
    eosio::check(!is_paused(), "paused");
    auto oit = oracles_table.require_find(oracle.value, "unknown oracle");
    check(!oit->suspended, "oracle suspended");
    req_table_type rt(get_self(), get_self().value);
    auto rit = rt.require_find(id, "no request found");
    check(rit->ver == ver, "version mismatch");
    for (auto& p : rit->parts) check(p.idx != oit->oracle_index, "duplicate part");
    rt.modify(rit, get_self(), [&](auto& r) { r.parts.push_back({oit->oracle_index, sig_i}); });
}

/* requestrand */
void orng::requestrand(uint64_t assoc_id, uint64_t signing_value, const eosio::name &caller) {
    check(!is_paused(), "Contract is paused");
    check(!is_paused_request(), "Orng.wax are under maintenance, please try again later");
    require_auth(caller);

    auto ban_list_it = ban_list_table.find(caller.value);
    if(ban_list_it != ban_list_table.end()) {
      return; // silently exit for banned accounts
    }

    auto version = get_config(active_ver_index, 0);
    check(version > 0, "key version not set");

    auto fee_per_call = get_config(fee_per_call_index, 0);

    auto it = acct_table.require_find(caller.value,"Please stake first"); 
    _refill(it);
    bool free_call = false;
    if(it->credits == 0){
        check(it->fee_balance.amount >= fee_per_call, "Please deposit");
        acct_table.modify(it,same_payer,[&](auto&r){ 
            r.fee_balance -= asset{static_cast<int64_t>(fee_per_call), WAX};
        });
    } else {
        // check treasury balance
        check(treas_singleton.exists(), "Treasury has no balance");
        auto treas_hardfloor_multiplier = get_config(treas_hardfloor_multiplier_index, 10);
        auto treas = treas_singleton.get();
        check(treas.pool_balance >= treas_hardfloor_multiplier * fee_per_call, "Treasury balance is insufficient");
        acct_table.modify(it,same_payer,[&](auto&r){
             r.credits--; 
        });
        free_call = true;
        // deduct from treasury pool
        treas.pool_balance -= fee_per_call;
        treas_singleton.set(treas, _self);
    }

    uint64_t nonce = it->last_nonce + 1;
    acct_table.modify(it, same_payer, [&](auto&r){
         r.last_nonce = nonce; 
    });

    // Convert signing_value to checksum256 using sha256(to_string(signing_value))
    std::string signing_value_str = std::to_string(signing_value);
    checksum256 seed = sha256(signing_value_str.c_str(), signing_value_str.size());
    
    auto next_job_id = generate_next_index();
    req_table.emplace(caller,[&](auto&r){
        r.id = next_job_id;
        r.dapp = caller; 
        r.seed = seed;
        r.ver = version; 
        r.nonce = nonce; 
        r.assoc_id = assoc_id;
        r.free_call = free_call;
        r.parts.clear();
    });
}

/* setrand - completes request */
ACTION orng::setrand(name oracle, uint64_t id, uint8_t ver, std::string sig){
    checksum256 rnd = _validate_and_compute_rnd(oracle, id, ver, sig);
    if (rnd == checksum256{}) return; // validation failed, oracle got strike

    uint64_t fee_per_call = get_config(fee_per_call_index, 0);
    auto rit = req_table.require_find(id, "no request found");

    // Attempt direct delivery via inline action
    action{
        permission_level{get_self(), "active"_n},
        rit->dapp, "receiverand"_n,
        std::make_tuple(rit->assoc_id, rnd)
    }.send();

    // If we reach here, delivery succeeded - clean up request
    req_table.erase(rit);

    _reward_oracles(asset{static_cast<int64_t>(fee_per_call), WAX});
    
    // Light cleanup on successful direct delivery - very small batch
    _cleanup_expired_results(5);
}

ACTION orng::markfailed(name oracle, uint64_t id, uint8_t ver, std::string sig, std::string error_message){
    checksum256 rnd = _validate_and_compute_rnd(oracle, id, ver, sig);
    if (rnd == checksum256{}) return; // validation failed, oracle got strike

    uint64_t fee_per_call = get_config(fee_per_call_index, 0);
    auto rit = req_table.require_find(id, "no request found");

    // Store result in undelivered table with error message
    undelivered_table_type undelivered_table(get_self(), get_self().value);
    uint64_t oracle_deadline_seconds = get_config(oracle_reward_deadline_index, 86400 * 1); // default 1 day
    
    
    undelivered_table.emplace(get_self(), [&](auto& r) {
        r.request_id = rit->id;
        r.dapp = rit->dapp;
        r.assoc_id = rit->assoc_id;
        r.rnd = rnd;
        r.error_message = error_message;
        r.oracle_reward_deadline = current_time_point() + eosio::seconds(oracle_deadline_seconds);
    });

    // Clean up request
    req_table.erase(rit);

    // Give oracle 50% reward immediately
    _reward_oracles(asset{static_cast<int64_t>(fee_per_call / 2), WAX});
    
    // Opportunistic cleanup - small batch to avoid timeout
    _cleanup_expired_results(10);
}

ACTION orng::retrydeliver(uint64_t request_id) {
    eosio::check(!is_paused(), "paused");

    undelivered_table_type undelivered_table(get_self(), get_self().value);
    auto undelivered_it = undelivered_table.require_find(request_id, "No undelivered result found for this request ID");

    // Check if any oracle can still claim reward
    bool oracle_can_claim = (current_time_point() <= undelivered_it->oracle_reward_deadline);

    // Attempt delivery via inline action
    action{
        permission_level{get_self(), "active"_n},
        undelivered_it->dapp, "receiverand"_n,
        std::make_tuple(undelivered_it->assoc_id, undelivered_it->rnd)
    }.send();

    // If we reach here, delivery succeeded - give remaining reward if eligible
    if (oracle_can_claim) {
        uint64_t fee_per_call = get_config(fee_per_call_index, 0);
        _reward_oracles(asset{static_cast<int64_t>(fee_per_call / 2), WAX}); // remaining 50%
    }

    // Remove from undelivered table
    undelivered_table.erase(undelivered_it);
    
    // Light cleanup
    _cleanup_expired_results(5);
}

ACTION orng::killjobs(const std::vector<uint64_t>& job_ids) {
    require_auth(GOV);

    for (const auto& id : job_ids) {
        auto job_it = req_table.find(id);
        if (job_it != req_table.end()) {
            req_table.erase(job_it);
        }
    }
}


ACTION orng::ban(const eosio::name& dapp) {
    require_auth(get_self());

    auto ban_list_it = ban_list_table.find(dapp.value);
    check(ban_list_it == ban_list_table.end(), "Dapp already added to the banlist");
    ban_list_table.emplace(get_self(), [&](auto& rec) {
      rec.dapp = dapp;
    });
}

ACTION orng::unban(const eosio::name& dapp) {
    require_auth(get_self());

    auto ban_list_it = ban_list_table.require_find(dapp.value, "Dapp not in the banlist");
    ban_list_table.erase(ban_list_it);
}

bool orng::is_paused() const {
    return get_config(paused_index, false);
}

bool orng::is_paused_request() const {
    return get_config(paused_request_row, false);
}

void orng::set_config(uint64_t name, int64_t value) {
    auto it = config_table.find(name);
    if (it == config_table.end()) {
        config_table.emplace(get_self(), [&](auto& rec) {
            rec.name = name;
            rec.value = value;
        });
    }
    else {
        config_table.modify(it, get_self(), [&](auto& rec) {
            rec.value = value;
        });
    }
}

int64_t orng::get_config(uint64_t name, int64_t default_value) const {
    auto it = config_table.find(name);
    if (it == config_table.end())
        return default_value;
    return it->value;
}

int64_t orng::get_dapp_config(eosio::name dapp, uint64_t name, int64_t default_value) const {
    dappconfig_table_type dappconfig_table(get_self(), dapp.value);
    auto it = dappconfig_table.find(name);
    if (it == dappconfig_table.end())
        return default_value;
    return it->value;
}

uint64_t orng::generate_next_index() {
    int64_t index_val = get_config(request_id_index, 0);
    set_config(request_id_index, index_val + 1);
    return index_val;
}

uint64_t orng::hash_to_int(const eosio::checksum256& value) {
   auto byte_array = value.extract_as_byte_array();
   uint64_t int_value = 0;
   for (int i = 0; i < 8; i++) {
      int_value <<= 8;
      int_value |= byte_array[i] & 127;
   }
   return int_value;
}

eosio::checksum256 orng::_validate_and_compute_rnd(eosio::name oracle, uint64_t id, uint8_t ver, const std::string& sig) {
    eosio::check(!is_paused(), "paused");
    require_auth(oracle);
    uint64_t strikes_max = get_config(strikes_max_index, 0);

    auto oit = oracles_table.require_find(oracle.value, "unknown oracle");
    check(!oit->suspended, "oracle suspended");

    auto rit = req_table.require_find(id, "no request found"); 
    check(rit->ver == ver, "version mismatch");
    
    // Check if result already stored in undelivered table
    undelivered_table_type undelivered_table(get_self(), get_self().value);
    auto undelivered_it = undelivered_table.find(rit->id);
    check(undelivered_it == undelivered_table.end(), "Result already marked as undelivered");

    auto pit = pkey_table.require_find(ver, "key not found");
    check(pit->retired == false, "key retired");

    checksum256 msg = make_msg(rit->seed, rit->dapp, rit->nonce);
    auto data = msg.extract_as_byte_array();
    bool ok = verify_rsa_sha256_sig(
            data.data(), data.size(), sig.c_str(), pit->exponent, pit->modulus);
    if(!ok){
        oracles_table.modify(oit, same_payer, [&](auto&r){
            if(++r.strikes >= strikes_max) r.suspended=true;
        });
        return checksum256{}; // empty checksum indicates failure
    }
    
    return sha256(sig.data(), sig.size());
}

ACTION orng::getresult(eosio::name caller, uint64_t assoc_id) {
    require_auth(caller);
    
    undelivered_table_type undelivered_table(get_self(), get_self().value);
    auto dapp_assoc_idx = undelivered_table.get_index<"bydappassoc"_n>();
    uint128_t dapp_assoc_key = (uint128_t{caller.value} << 64) | assoc_id;
    auto undelivered_it = dapp_assoc_idx.require_find(dapp_assoc_key, "No undelivered result found for this assoc_id");
    
    // Check if oracle can still claim reward
    bool oracle_can_claim = (current_time_point() <= undelivered_it->oracle_reward_deadline);
    
    action{
        permission_level{get_self(), "active"_n},
        caller, "receiverand"_n,
        std::make_tuple(assoc_id, undelivered_it->rnd)
    }.send();
    
    // If delivery succeeded and oracle deadline not passed, give remaining reward
    if (oracle_can_claim) {
        uint64_t fee_per_call = get_config(fee_per_call_index, 0);
        _reward_oracles(asset{static_cast<int64_t>(fee_per_call / 2), WAX}); // remaining 50%
    }
    
    dapp_assoc_idx.erase(undelivered_it);
    
    // Light cleanup
    _cleanup_expired_results(5);
}

ACTION orng::cleanup(eosio::name oracle, uint64_t batch_size) {
    eosio::check(!is_paused(), "paused");
    require_auth(oracle);
    
    // Validate batch size to prevent abuse
    check(batch_size > 0 && batch_size <= 1000, "invalid batch size");

    auto oit = oracles_table.require_find(oracle.value, "unknown oracle");
    check(!oit->suspended, "oracle suspended");
    
    _cleanup_expired_results(batch_size);
}

void orng::_cleanup_expired_results(uint64_t batch_size) {
    // Early exit if table is small
    undelivered_table_type undelivered_table(get_self(), get_self().value);
    if (std::distance(undelivered_table.begin(), undelivered_table.end()) < 10) {
        return; // Skip cleanup if few entries
    }
    
    auto current_time = current_time_point();
    uint64_t processed = 0;
    
    auto it = undelivered_table.begin();
    while (it != undelivered_table.end() && processed < batch_size) {
        // Clean up only when oracle reward deadline has passed
        if (current_time > it->oracle_reward_deadline) {
            it = undelivered_table.erase(it);
        } else {
            ++it;
        }
        processed++;
    }
}


