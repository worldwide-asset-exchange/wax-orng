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

#pragma once

#include "common.hpp"

#include <algorithm>
#include <stdint.h>
#include <string>
#include <vector>

using eosio::chain::checksum256_type;

struct __attribute((packed)) config_entry {
    uint64_t name;
    int64_t  value;
};
FC_REFLECT(config_entry, (name)(value));

struct __attribute((packed)) jobs_entry {
    uint64_t    id;
    uint64_t    assoc_id;
    uint64_t    signing_value;
    wax::name   caller;
};
FC_REFLECT(jobs_entry, (id)(assoc_id)(signing_value)(caller));

struct __attribute((packed)) sigpubkey_entry {
    uint64_t    id;
    std::string exponent;
    std::string modulus;
};
FC_REFLECT(sigpubkey_entry , (id)(exponent)(modulus));

// randreceiver table
struct __attribute((packed)) results_entry {
    uint64_t    id;
    uint64_t    assoc_id;
    checksum256_type random_value;
};
FC_REFLECT(results_entry, (id)(assoc_id)(random_value));


struct wax_fixture: public EOSIO_FIXTURE {
    using perm_vec_t = std::vector<wax::permission_level>;
    
    static inline const wax::name oracle_n =     N(oracle.wax);
    static inline const wax::name receiver_n =   N(randreceiver);
    static inline const wax::name somecaller_n = N(somecaller);

    wax_fixture() {
        try {
            setup_contracts_and_tokens();
            create_all_permissions();
        }
        FC_LOG_AND_RETHROW();
    }

    /// This overload is necessary because the EOS guys provide a
    /// a function to read the abi that return a vector<char>, but they, at
    /// the same time, have the 'set_abi' helper that expects a 'const char*' :-O
    void set_abi(wax::account_name account, 
                 const std::vector<char>& abi_json, 
                 const wax::private_key_type* signer = nullptr) {
        std::string abi { abi_json.begin(), abi_json.end() };
        EOSIO_FIXTURE::set_abi(account, abi.c_str(), signer);
    }
    
    void create_permission_and_link(const wax::name& account, 
                                    const wax::name& code, 
                                    const wax::name& permission, 
                                    const wax::name& action) {
        const auto priv_key = get_private_key(account, permission.to_string());
        const auto pub_key = priv_key.get_public_key();
        set_authority(account, permission, wax::authority(pub_key));
        link_authority(account, code, permission, action);
        produce_block();
    }

    void create_all_permissions() {
        using wax::contract_info::account_n;
        create_permission_and_link(account_n, account_n, N(pause), N(pause));
    }

    void setup_contracts_and_tokens() {
        using wax::contract_info::account_n;
        
        create_accounts({ account_n, oracle_n, receiver_n, somecaller_n });
        
        set_code(account_n, contract_helpers::get_wasm());
        set_abi(account_n, contract_helpers::get_abi());

        set_code(receiver_n, contract_helpers::get_wasm("wax.orng.tests.randreceiver.wasm"));
        set_abi(receiver_n, contract_helpers::get_abi("wax.orng.tests.randreceiver.abi"));

        produce_block();
    }

    template<class T>
    void get_entry(T& obj, 
                   wax::account_name name, 
                   wax::account_name scope, 
                   wax::account_name table, 
                   uint64_t key) {
        get_table_entry(obj, name, scope, table, key, false);
    }

    int64_t get_config_value(uint64_t name,
                             const wax::account_name& acc_name = wax::contract_info::account_n,
                             const wax::account_name& acc_scope = wax::contract_info::account_n) {
        config_entry config;
        get_table_entry(config, acc_name, acc_scope, N(config_a), name, false);
        return config.value;
    }

    auto get_jobs_entry(uint64_t id) {
        using wax::contract_info::account_n;
        jobs_entry jobs;
        get_table_entry(jobs, account_n, account_n, N(jobs.a), id, false);
        return jobs;
    }

    auto get_sigpubkey_entry(uint64_t id) {
        using wax::contract_info::account_n;
        sigpubkey_entry sigpubkey;
        get_table_entry(sigpubkey, account_n, account_n, N(sigpubkey.a), id, false);
        return sigpubkey;
    }

    auto get_results_entry() {
        results_entry results;
        get_table_entry(results, receiver_n, receiver_n, N(results), 0, false);
        return results;
    }

    bool contract_is_paused() {
        return get_config_value(N(paused)) != 0;
    }

    /// This generic push_action logs action result to screen (it's easier to
    /// code it than manipulate the controller::config::contracts_console flag
    /// at fixture creation)
    template<typename T>
    void push_action(const eosio::chain::account_name& code,
                     const eosio::chain::action_name& acttype,
                     const T& actor_auth_perm,
                     const eosio::chain::variant_object& data) {
        eosio::chain::transaction_trace_ptr ttp = 
            EOSIO_FIXTURE::push_action(code, acttype, actor_auth_perm, data);

        if (ttp.get() != nullptr && std::any_of(
                ttp->action_traces.begin(), ttp->action_traces.end(),
                [](const auto& act) { return !act.console.empty(); })) {

            BOOST_TEST_MESSAGE(">> Output from action [" << acttype.to_string() << "]:");
            for (const auto& at: ttp->action_traces) {
                if (!at.console.empty())
                    BOOST_TEST_MESSAGE(at.console);
            }
        }
    }

    /// @todo Add other generic helper here
    void action_pause(bool paused,
                      const wax::permission_level& auths = { wax::contract_info::account_n, N(pause) }) {
        push_action(
            wax::contract_info::account_n,
            N(pause),
            perm_vec_t{{ auths }},
            wax::mvo() ("paused", paused));
    }

    void action_version(const wax::name& contract = wax::contract_info::account_n) {
        push_action(contract, N(version), contract, wax::mvo());
    }

    void action_requestrand(uint64_t assoc_id, 
                            uint64_t signing_value,
                            const wax::name& caller) {
        push_action(
            wax::contract_info::account_n,
            N(requestrand),
            caller,
            wax::mvo() ("assoc_id", assoc_id)
                       ("signing_value", signing_value)
                       ("caller", caller));
    }

    void action_setrand(uint64_t job_id, const std::string& random_value) {
        push_action(
            wax::contract_info::account_n,
            N(setrand),
            oracle_n,
            wax::mvo() ("job_id", job_id)("random_value", random_value));
    }

    void action_setsigpubkey(const std::string& exponent, const std::string& modulus) {
        push_action(
            wax::contract_info::account_n,
            N(setsigpubkey), 
            oracle_n,
            wax::mvo()("exponent", exponent)("modulus", modulus));
    }

    void action_killjobs(const std::vector<uint64_t>& job_ids) {
        push_action(
            wax::contract_info::account_n,
            N(killjobs),
            oracle_n,
            wax::mvo() ("job_ids", job_ids));
    }


}; // struct wax_fixture
