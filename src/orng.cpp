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
#include "contract_info.hpp"

#include <eosio/check.hpp>
#include <eosio/crypto.hpp>
#include <eosio/print.hpp>

#include <tuple>

using namespace eosio;
using std::string;

static constexpr uint64_t jobid_index = "jobid.index"_n.value;
static constexpr uint64_t paused_index = "paused"_n.value;
const uint64_t seconds_per_day = 60 * 60 * 24;

orng::orng(const name& receiver, 
           const name& code, 
           const datastream<const char*>& ds)
    : contract(receiver, code, ds)
    , config_table(receiver, receiver.value)
    , sigpubconfig_table(receiver, receiver.value)
    , jobs_table(receiver, receiver.value)
    , sigpubkey_table(receiver, receiver.value) 
    , bwpayers_table(receiver, receiver.value) {
}

ACTION orng::pause(bool paused) {
    require_auth({get_self(), "pause"_n});
    set_config(paused_index, uint64_t(paused));
}

ACTION orng::version() {
    using namespace wax::contract_info;
    
    print_f("Contract version = %", version::cstr_value);
    
    constexpr auto ver_val = "version"_n.value;
    
    auto update_version_fn = [](auto& rec) { rec = { ver_val, version::int_value }; };
    
    /// @todo This should be written inside de "if(...)" but cppcheck still doesn't support C++17
    auto it = config_table.find(ver_val);
    
    if (it != config_table.end()) {
        using namespace std::string_literals;
        auto msg = "Version is already "s + version::cstr_value;
        check(it->value != version::int_value, msg);
        config_table.modify(it, get_self(), update_version_fn);
    }
    else
        config_table.emplace(get_self(), update_version_fn);
}

ACTION orng::setbwpayer(const eosio::name& payee, const eosio::name& payer) {
    check(!is_paused(), "Contract is paused");
    require_auth(payee);

    auto it = bwpayers_table.find(payee.value);

    check(is_account(payer), "payer account does not exist");

    if (it == bwpayers_table.end()) {
        bwpayers_table.emplace(payee, [&](auto& rec) {
            rec.payee = payee;
            rec.payer = payer;
            rec.accepted = false;
        });
    } else {
        check(it->payer != payer, "payer for this contract has already set with that account");
        bwpayers_table.modify(it, same_payer, [&](auto& rec) {
            rec.payer = payer;
            rec.accepted = false;
        });
    }
}

ACTION orng::acceptbwpay(const eosio::name& payee, const eosio::name& payer, bool accepted) {
    check(!is_paused(), "Contract is paused");
    require_auth(payer);

    auto it = bwpayers_table.require_find(payee.value, "payer does not exist");

    check(it->payer == payer, "invalid payer");

    bwpayers_table.modify(it, same_payer, [&](auto& rec) {
        rec.accepted = accepted;
    });
}

ACTION orng::requestrand(uint64_t assoc_id, 
                         uint64_t signing_value, 
                         const name& caller) {
    check(!is_paused(), "Contract is paused");
    require_auth(caller);
    auto next_job_id = generate_next_index();
    auto current_active_key = update_current_public_key(next_job_id);
    signvals_table_type signvals_table_by_scope(get_self(), current_active_key);
    auto it = signvals_table_by_scope.find(signing_value);
    check(it == signvals_table_by_scope.end(), "Signing value already used");

    signvals_table_by_scope.emplace(caller, [&](auto& rec) {
        rec.signing_value = signing_value;
    });

    jobs_table.emplace(caller, [&](auto& rec) {
        rec.id = next_job_id;
        rec.assoc_id = assoc_id;
        rec.signing_value = signing_value;
        rec.caller = caller;
    });
}

ACTION orng::setrand(uint64_t job_id, const string& random_value) {
    require_auth("oracle.wax"_n);
    check(!is_paused(), "Contract is paused");

    auto job_it = jobs_table.find(job_id);
    check(job_it != jobs_table.end(), "Could not find job id.");

    uint64_t sig_val{job_it->signing_value};

    auto current_active_key = get_current_public_key();
    auto pubconfig = sigpubconfig_table.get();
    auto it = sigpubkey_table.require_find(pubconfig.active_key_index, "sanity check");
    
    check(verify_rsa_sha256_sig(
            &sig_val, sizeof(sig_val), random_value, it->exponent, it->modulus),
            "Could not verify signature.");
    
    checksum256 rv_hash = sha256(random_value.data(), random_value.size());

    action(
        {get_self(), "active"_n}, 
        job_it->caller, "receiverand"_n,
        std::tuple(job_it->assoc_id, rv_hash))
        .send();

    jobs_table.erase(job_it);
}

ACTION orng::killjobs(const std::vector<uint64_t>& job_ids) {
    require_auth("oracle.wax"_n);

    for (const auto& id : job_ids) {
        auto job_it = jobs_table.find(id);
        if (job_it != jobs_table.end()) {
            jobs_table.erase(job_it);
        }
    }
}

ACTION orng::setchance(uint64_t chance_to_switch) {
    require_auth("oracle.wax"_n);

    check(chance_to_switch >= 1, "The chance must be great then 1 hour");
    auto pubconfig = sigpubconfig_table.get();
    pubconfig.chance_to_switch = chance_to_switch;
    sigpubconfig_table.set(pubconfig, _self);
}

ACTION orng::setsigpubkey(uint64_t id,
                          const std::string& exponent, 
                          const std::string& modulus) {
    require_auth("oracle.wax"_n);

    check(modulus.size() > 0, "modulus must have non-zero length");
    check(modulus[0] != '0', "modulus must have leading zeroes stripped");

    if (!sigpubconfig_table.exists()) {
        check(id == 0, "only init public key with id is zero");
        sigpubkey_config pubconfig;
        pubconfig.chance_to_switch = 1'000'000;
        pubconfig.active_key_index = 0;
        pubconfig.available_key_counter = 1;
        sigpubconfig_table.get_or_create(get_self(), pubconfig);
    } else {
        auto pubconfig = sigpubconfig_table.get();
        check(id > pubconfig.active_key_index, "only allow set ket for the next keys");
        check(id == pubconfig.available_key_counter, "make sure the next key in order");
        pubconfig.available_key_counter += 1;
        sigpubconfig_table.set(pubconfig, get_self());
    }

    auto pubkey_hash_id = hash_to_int(sha256(const_cast<char*>(modulus.c_str()), modulus.size()));
    auto byhash_idx = sigpubkey_table.get_index<"byhashid"_n>();
    auto byhash_itr = byhash_idx.find(pubkey_hash_id);
    check(byhash_itr == byhash_idx.end(), "public key already exist");

    auto it = sigpubkey_table.find(id);
    check(it == sigpubkey_table.end(), "must use different modulus");

    sigpubkey_table.emplace(get_self(), [&](auto& rec) {
        rec.id = id;
        rec.pubkey_hash_id = pubkey_hash_id;
        rec.exponent = exponent;
        rec.modulus = modulus;
    });
}

ACTION orng::cleansigvals(uint64_t pubkey_hash_id, uint64_t rows_num) {
    require_auth("oracle.wax"_n);

    auto byhash_idx = sigpubkey_table.get_index<"byhashid"_n>();
    auto byhash_itr = byhash_idx.require_find(pubkey_hash_id, "pubkey_hash_id does not exist");

    auto pubconfig = sigpubconfig_table.get();
    check(byhash_itr->id < pubconfig.active_key_index, "only allow clean the signvals that was singed by old keys");

    signvals_table_type signvals_table_by_scope(get_self(), pubkey_hash_id);

    auto itr = signvals_table_by_scope.begin();
    while (itr != signvals_table_by_scope.end() && rows_num > 0) {
        itr = signvals_table_by_scope.erase(itr);
        --rows_num;
    }
}

bool orng::is_paused() const {
    return get_config(paused_index, false);
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

uint64_t orng::generate_next_index() {
    int64_t index_val = get_config(jobid_index, 0);
    set_config(jobid_index, index_val + 1);
    return index_val;
}

uint64_t orng::update_current_public_key(uint64_t job_id) {
    auto pubconfig = sigpubconfig_table.get();
    if (job_id % pubconfig.chance_to_switch == 0)  {
        pubconfig.active_key_index += 1;
        sigpubconfig_table.set(pubconfig, get_self());
        check(pubconfig.active_key_index < pubconfig.available_key_counter, "admin: no available public-key");
    }
    return get_current_public_key();
}

uint64_t orng::get_current_public_key() {
    auto pubconfig = sigpubconfig_table.get();
    auto it = sigpubkey_table.require_find(pubconfig.active_key_index, "sanity check");
    return it->pubkey_hash_id;
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

EOSIO_DISPATCH(orng, 
    (pause)
    (version)
    (requestrand)
    (setbwpayer)
    (acceptbwpay)
    (setrand)
    (killjobs)
    (setsigpubkey)
    (cleansigvals)
)
