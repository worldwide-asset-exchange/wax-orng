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

#include "contract_info.hpp"

#include <eosio/eosio.hpp>
#include <eosio/check.hpp>
#include <eosio/crypto.hpp>
#include <eosio/print.hpp>

#include <stdint.h>
#include <string>
#include <tuple>
#include <algorithm>    // std::count

using namespace eosio;
using std::string;

/// Tested with wax-cdt wax-1.6.1-1.0.0
CONTRACT WAX_CONTRACT_NAME: public contract {
public:
    WAX_CONTRACT_NAME(name receiver, name code, datastream<const char*> ds)
        : contract(receiver, code, ds)
        , config_table(receiver, receiver.value)
        , jobs_table(receiver, receiver.value)
        , sigpubkey_table(receiver, receiver.value) {
    }

    // Actions
    
    ACTION pause(bool paused) {
        require_auth({get_self(), "pause"_n});
        set_config(PAUSED_ROW, uint64_t(paused));
    }

    ACTION version() {
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

    ACTION requestrand(uint64_t assoc_id, uint64_t signing_value, const name& caller) {
        check(!is_paused(), "Contract is paused");
        require_auth(caller);
        auto size = std::distance(sigpubkey_table.cbegin(), sigpubkey_table.cend());
        auto scope = get_self().value;
        if ( size > 1 ) {
            scope = size - 1;
        }
        signvals_table_type signvals_table_by_scope(get_self(), scope);
        auto it = signvals_table_by_scope.find(signing_value);
        check(it == signvals_table_by_scope.end(), "Signing value already used");

        signvals_table_by_scope.emplace(caller, [&](auto& rec) {
            rec.signing_value = signing_value;
        });

        jobs_table.emplace(caller, [&](auto& rec) {
            rec.id = generate_next_index();
            rec.assoc_id = assoc_id;
            rec.signing_value = signing_value;
            rec.caller = caller;
        });
    }

    ACTION setrand(uint64_t job_id, const string& random_value) {
        require_auth("oracle.wax"_n);
        check(!is_paused(), "Contract is paused");

        auto job_it = jobs_table.find(job_id);
        check(job_it != jobs_table.end(), "Could not find job id.");

        uint64_t sig_val{job_it->signing_value};

        auto size = std::distance(sigpubkey_table.cbegin(), sigpubkey_table.cend());
        auto sig_it = sigpubkey_table.find(size - 1);
        
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

    /**
     * @dev Removes jobs from the jobs table. The Oracle calls on it passing a list of dangling jobs.
     * @param job_ids A vector of jobs IDs to be removed.
     */
    ACTION killjobs(const std::vector<uint64_t>& job_ids) {
        require_auth("oracle.wax"_n);

        for (const auto& id : job_ids) {
            auto job_it = jobs_table.find(id);
            if (job_it != jobs_table.end()) {
                jobs_table.erase(job_it);
            }
        }
    }
  
    /**
     * @dev Sets the new public key used by the oracle to sign tx ids. Public keys are
     * stored in their raw RSA exponent and modulus form as hexadecimal integers represented
     * by strings of hex characters.
     * @param exponent [string] the public key exponent
     * @param modulus [string] the public key modulus
     * openssl rsa -in TestData/wax.4096.public.pem -pubin -text -noout
     */
    ACTION setsigpubkey(const std::string& exponent, const std::string& modulus) {
        require_auth("oracle.wax"_n);

        check(modulus.size() > 0, "modulus must have non-zero length");
        check(modulus[0] != '0', "modulus must have leading zeroes stripped");
        
        for (auto itr = sigpubkey_table.cbegin(); itr != sigpubkey_table.cend(); itr++) {
            check(itr->modulus != modulus, "should use different public key modulus");
        }
        
        sigpubkey_table.emplace(get_self(), [&](auto& rec) {
            rec.id = sigpubkey_table.available_primary_key();
            rec.exponent = exponent;
            rec.modulus = modulus;
        });
    }

    /**
     * @dev clean the signing values from dapp which has been signed with no longer used public-key.
     * @param pubkey_id A vector of jobs IDs to be removed.
     * @param rows_num The number of rows that be expected to be removed
     * @note it does not allow to removing the signing values which have scope is the newest id of public-key
     */
    ACTION cleansigvals(uint64_t pubkey_id, uint64_t rows_num) {
        require_auth("oracle.wax"_n);
        auto size = std::distance(sigpubkey_table.cbegin(), sigpubkey_table.cend());
        check(pubkey_id < size - 1, "only allow id of publikey which no longer used");
        auto scope = get_self().value;
        if ( pubkey_id > 1 ) {
            scope = pubkey_id;
        }
        signvals_table_type signvals_table_by_scope(get_self(), scope);

        auto itr = signvals_table_by_scope.begin();
        while (itr != signvals_table_by_scope.end() && rows_num > 0) {
            itr = signvals_table_by_scope.erase(itr);
            --rows_num;
        }
    }
// Implementation
private:
    TABLE config_a {
        uint64_t name;
        int64_t  value;

        auto primary_key() const { return name; }
    };
    using config_table_type = multi_index<"config.a"_n, config_a>;

    TABLE jobs_a {
        uint64_t id;
        uint64_t assoc_id;
        uint64_t signing_value;
        name     caller;

        auto primary_key() const { return id; }
    };
    using jobs_table_type = multi_index<"jobs.a"_n, jobs_a>;

    // scope by public-key id 
    TABLE signvals_a {
        uint64_t signing_value;

        auto primary_key() const { return signing_value; }
    };
    using signvals_table_type = multi_index<"signvals.a"_n, signvals_a>;

    TABLE sigpubkey_a {
        uint64_t id;
        string   exponent;
        string   modulus;

        auto primary_key() const { return id; }
    };
    using sigpubkey_table_type = multi_index<"sigpubkey.a"_n, sigpubkey_a>;

    config_table_type   config_table;
    jobs_table_type     jobs_table;
    sigpubkey_table_type sigpubkey_table;

    static constexpr uint64_t PAUSED_ROW = "paused"_n.value;
    
    // Helpers
    
    bool is_paused() const {
        return get_config(PAUSED_ROW, false);
    }

    void set_config(uint64_t name, int64_t value) {
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

    int64_t get_config(uint64_t name, int64_t default_value) const {
        auto it = config_table.find(name);
        if (it == config_table.end()) 
            return default_value;
        return it->value;
    }

    uint64_t generate_next_index() {
        const uint64_t entry_name{"jobid.index"_n.value};
        int64_t index_val = get_config(entry_name, 0);
        set_config(entry_name, index_val + 1);
        return index_val;
    }
    
    /// @todo Add other helpers here

}; // CONTRACT WAX_CONTRACT_NAME

EOSIO_DISPATCH(WAX_CONTRACT_NAME, 
    (pause)
    (version)
    (requestrand)
    (setrand)
    (killjobs)
    (setsigpubkey)
    (cleansigvals)
)
