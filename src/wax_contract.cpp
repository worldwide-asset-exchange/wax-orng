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

using namespace eosio;
using std::string;


/// Tested with CDT 1.6.1
CONTRACT WAX_CONTRACT_NAME: public contract {
public:
    WAX_CONTRACT_NAME(name receiver, name code, datastream<const char*> ds)
        : contract(receiver, code, ds)
        , config_table(receiver, receiver.value)
        , jobs_table(receiver, receiver.value)
        , signvals_table(receiver, receiver.value)
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

        auto it = signvals_table.find(signing_value);
        check(it == signvals_table.end(), "Signing value already used");

        signvals_table.emplace(caller, [&](auto& rec) {
            rec.signing_value = signing_value;
        });

        jobs_table.emplace(caller, [&](auto& rec) {
            //auto_index index_val(*this);   // overload operator() to avoid this instantiation
            //rec.id = index_val;
            rec.id = jobs_table.available_primary_key();
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
        auto sig_it = sigpubkey_table.find(0);
        
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
    ACTION killjobs(const std::vector<int>& job_ids) {
        require_auth("oracle.wax"_n);

        for (const auto& id : job_ids) {
            auto job_it = jobs_table.find(id);
            if  (job_it != jobs_table.end()) {
               jobs_table.erase(job_it);
            }
        }
    }
  
    /**
     * @dev Sets the public key used by the oracle to sign tx ids. Public keys are
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

        auto it = sigpubkey_table.find(0);
        if (it == sigpubkey_table.end()) {
            sigpubkey_table.emplace(get_self(), [&](auto& rec) {
                rec.id = 0;
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
    signvals_table_type signvals_table;
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

    class auto_index {
    public:
        auto_index(WAX_CONTRACT_NAME& parent_val)
            : parent(parent_val) {
        }

        operator uint64_t const() {
            ++index;
            save();
            return get_index();
        }

        uint64_t get_index() const {
            return index;
        }

    private:
        void save() {
            parent.set_config(entry_name, static_cast<int64_t>(index));
        }

        uint64_t find_reusable() const {
            // Implement index reusability here ...
            return 0;
        }

    private:
            WAX_CONTRACT_NAME& parent;
            uint64_t index{0};
            const uint64_t entry_name{uint64_t("jobid.index")};
    };
    
    /// @todo Add other helpers here

}; // CONTRACT WAX_CONTRACT_NAME

EOSIO_DISPATCH(WAX_CONTRACT_NAME, 
    (pause)
    (version)
    (requestrand)
    (setrand)
    (killjobs)
    (setsigpubkey)
)
