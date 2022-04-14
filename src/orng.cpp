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

const uint64_t jobid_name{"jobid.index"_n.value};

orng::orng(const name& receiver, 
           const name& code, 
           const datastream<const char*>& ds)
    : contract(receiver, code, ds)
    , config_table(receiver, receiver.value)
    , jobs_table(receiver, receiver.value)
    , signvals_table(receiver, receiver.value)
    , sigpubkey_table(receiver, receiver.value)
    , signvals_scopes_table(receiver, receiver.value) {
}

ACTION orng::pause(bool paused) {
    require_auth({get_self(), "pause"_n});
    set_config(paused_row, uint64_t(paused));
}

ACTION orng::setrotation(uint64_t range) {
    require_auth(get_self());
    check(range > 0, "range must be positive");
    if (signvals_scopes_table.exists()) {
        auto scopes_table = signvals_scopes_table.get();
        scopes_table.range = range;
        signvals_scopes_table.set(scopes_table, get_self());
    } else {
        signvals_scope scopes_table;
        int64_t current_jobid_val = get_config(jobid_name, 0);
        scopes_table.start_jobid_scopes.push_back(current_jobid_val);
        scopes_table.range = range;
        signvals_scopes_table.set(scopes_table, get_self());
    }
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

ACTION orng::requestrand(uint64_t assoc_id, 
                         uint64_t signing_value, 
                         const name& caller) {
    check(!is_paused(), "Contract is paused");
    require_auth(caller);

    auto id = generate_next_index();
    auto current_scope = get_current_scope(id);
    signvals_table_type  signvals_table_by_scope(get_self(), current_scope);
    auto it = signvals_table_by_scope.find(signing_value);
    check(it == signvals_table_by_scope.end(), "Signing value already used");

    signvals_table_by_scope.emplace(caller, [&](auto& rec) {
        rec.signing_value = signing_value;
    });

    jobs_table.emplace(caller, [&](auto& rec) {
        rec.id = id;
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
    auto public_key_index = get_public_key_index(job_id);
    auto sig_it = sigpubkey_table.find(public_key_index);
    
    check(sig_it != sigpubkey_table.end(), "Could not find a value in sigpubkey table.");
    check(verify_rsa_sha256_sig(
            &sig_val, sizeof(sig_val), random_value, sig_it->exponent, sig_it->modulus),
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

ACTION orng::setsigpubkey(uint64_t id,
                          const std::string& exponent, 
                          const std::string& modulus) {
    require_auth("oracle.wax"_n);

    check(modulus.size() > 0, "modulus must have non-zero length");
    check(modulus[0] != '0', "modulus must have leading zeroes stripped");

    auto it = sigpubkey_table.find(id);
    if (it == sigpubkey_table.end()) {
        sigpubkey_table.emplace(get_self(), [&](auto& rec) {
            rec.id = id;
            rec.exponent = exponent;
            rec.modulus = modulus;
        });
    } 
    else {
        sigpubkey_table.modify(it, same_payer, [&](auto& rec) {
            rec.exponent = exponent;
            rec.modulus = modulus;
        });
    }
}

bool orng::is_paused() const {
    return get_config(paused_row, false);
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
    int64_t index_val = get_config(jobid_name, 0);
    ++index_val;
    set_config(jobid_name, index_val);

    auto scopes_table = signvals_scopes_table.get();
    auto jobid_scopes = scopes_table.start_jobid_scopes;
    auto last_scope = jobid_scopes[jobid_scopes.size() - 1];
    if (index_val >= last_scope + scopes_table.range) {
        scopes_table.start_jobid_scopes.push_back(index_val);
        signvals_scopes_table.set(scopes_table, get_self());
    }
    return index_val;
}

uint64_t orng::get_current_scope(uint64_t jobid) {
    auto scopes_table = signvals_scopes_table.get();
    auto jobid_scopes = scopes_table.start_jobid_scopes;

    for (int i =1 ; i < jobid_scopes.size() ; i++) {
        if (jobid_scopes[i-1] <= jobid && jobid < jobid_scopes[i]) {
            return jobid_scopes[i-1];
        }
    }
    return get_self().value;
}

// rotate the public key after finish a round from range.begin to range.end
uint64_t orng::get_public_key_index(uint64_t jobid) {
    int64_t scope = get_current_scope(jobid);
    if (scope == get_self().value) {
        return 0;
    }

    return scope%2;
}

EOSIO_DISPATCH(orng, 
    (pause)
    (version)
    (requestrand)
    (setrand)
    (killjobs)
    (setsigpubkey)
)
