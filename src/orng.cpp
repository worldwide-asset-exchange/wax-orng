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

#define DEFAULT_BWPAYER_MAX_JOBS 1000
#define DEFAULT_FREE_MAX_JOBS 100
#define ORACLE_MODE 0
#define DECENTRALIZE_MODE 1

static constexpr uint64_t paused_request_row            = "pauserequest"_n.value; // pause only requestrand action
static constexpr uint64_t paused_index                  = "paused"_n.value;       // pause all actions except pause
static constexpr uint64_t jobid_index                   = "jobid.index"_n.value;  // next job id row
static constexpr uint64_t dapp_error_log_size_index     = "erorrlogsize"_n.value;  // maximum number of error messages log in table
static constexpr uint64_t bwpaid_max_jobs               = "bwpaidmaxjob"_n.value;  // maximum number of jobs to queue per dapp for bandwidth paid tier
static constexpr uint64_t free_max_jobs                 = "freemaxjobs"_n.value;  // maximum number of jobs to queue per dapp for the free tier
static constexpr uint64_t unset_max_jobs                = 9007199254740991;  // flag to remove an entry from the custom max jobs table (Javascript's MAX_SAFE_INTEGER value)
static constexpr uint64_t running_mode_index            = "runningmode"_n.value;   // running mode of rng, oracle or decentralize

const name v1_ram_account                               = "oraclev1.wax"_n;

orng::orng(const name& receiver,
           const name& code,
           const datastream<const char*>& ds)
    : contract(receiver, code, ds)
    , config_table(receiver, receiver.value)
    , sigpubconfig_table(receiver, receiver.value)
    , decentralize_config_table(receiver, receiver.value)
    , jobs_table(receiver, receiver.value)
    , sigpubkey_table(receiver, receiver.value)
    , bwpayers_table(receiver, receiver.value)
    , signvals_table_v1_support(receiver, receiver.value)
    , sigpubkey_table_v1(receiver, receiver.value)
    , jobs_count_table(receiver, receiver.value)
    , max_jobs_table(receiver, receiver.value)
    , ban_list_table(receiver, receiver.value)
    , node_table(receiver, receiver.value)
    , epoch_seed_table(receiver, receiver.value)
    , epoch_signature_table(receiver, receiver.value)
    , epoch_table(receiver, receiver.value) {
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

ACTION orng::dapperror(eosio::name dapp, uint64_t job_id, const std::string message) {
    auto job_it = jobs_table.find(job_id);
    check(job_it != jobs_table.end(), "Could not find job id.");
    check(job_it->caller == dapp, "dapp caller mismatch");

    require_auth({job_it->caller, "ornglog"_n});

    errorlog_table_type errorlog_table(get_self(), job_it->caller.value);
    uint64_t log_id = errorlog_table.available_primary_key();

    uint64_t error_log_size = get_dapp_config(job_it->caller, dapp_error_log_size_index, 0);

    while (
        errorlog_table.begin() != errorlog_table.end() &&
        errorlog_table.rbegin()->id - errorlog_table.begin()->id + 1 >= error_log_size
    ) {
        errorlog_table.erase(errorlog_table.begin());
    }

    if (error_log_size == 0) {
        return;
    }

    errorlog_table.emplace(job_it->caller, [&](auto& rec) {
        rec.id = errorlog_table.available_primary_key();
        rec.dapp = job_it->caller;
        rec.assoc_id = job_it->assoc_id;
        rec.message = message;
    });
}

ACTION orng::seterrorsize(const eosio::name& dapp, uint64_t queue_size) {
    require_auth(dapp);

    dappconfig_table_type dappconfig_table(get_self(), dapp.value);
    auto it = dappconfig_table.find(dapp_error_log_size_index);
    if (it == dappconfig_table.end()) {
        dappconfig_table.emplace(dapp, [&](auto& rec) {
            rec.name = dapp_error_log_size_index;
            rec.value = queue_size;
        });
    } else {
        dappconfig_table.modify(it, same_payer, [&](auto& rec) {
            rec.value = queue_size;
        });
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

ACTION orng::setbwpayer(const eosio::name& payee, const eosio::name& payer) {
    check(!is_paused(), "Contract is paused");
    if (!has_auth(get_self())) {
        require_auth(payee);
    } else {
        check(is_account(payee), "payee account does not exist");
    }

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

    auto it = bwpayers_table.require_find(payee.value, "payee does not exist");

    check(it->payer == payer, "invalid payer");

    bwpayers_table.modify(it, same_payer, [&](auto& rec) {
        rec.accepted = accepted;
    });
}

ACTION orng::v1rrcompat(uint64_t signing_value) {
    require_auth(v1_ram_account);
    // add the signing value to the signig valyues tracking under self scope to support legacy contrtacts that require it
    // we use the v1_ram_account account as the payer so we do not burden the caller with the RAM cost for this legacy support
    signvals_table_v1_support.emplace(v1_ram_account, [&](auto& rec) {
        rec.signing_value = signing_value;
    });
}

ACTION orng::nextsignkey() {
    require_auth(get_self());

    auto pubconfig = sigpubconfig_table.get();

    int64_t index_val = get_config(jobid_index, 0);
    int64_t last_job_id = index_val - 1;

    auto current_key_it = sigpubkey_table.require_find(pubconfig.active_key_index, "sanity check");
    sigpubkey_table.modify(current_key_it, get_self(), [&](auto& rec) {
        rec.last = last_job_id;
    });
    pubconfig.active_key_index += 1;
    sigpubconfig_table.set(pubconfig, get_self());
}

ACTION orng::requestrand(uint64_t assoc_id,
                         uint64_t signing_value,
                         const name& caller) {
    check(!is_paused(), "Contract is paused");
    check(!is_paused_request(), "Orng.wax are under maintenance, please try again later");

    require_auth(caller);

    auto ban_list_it = ban_list_table.find(caller.value);
    if(ban_list_it != ban_list_table.end()) {
      return; // silently exit for banned accounts
    }

    auto next_job_id = generate_next_index();
    auto current_active_key = update_current_public_key(next_job_id);
    signvals_table_type signvals_table_by_scope(get_self(), current_active_key);
    auto it = signvals_table_by_scope.find(signing_value);
    check(it == signvals_table_by_scope.end(), "Signing value already used");

    check(get_job_count(caller) < get_max_jobs(caller), "Too many jobs in queue. If you do not already have one, register a bandwidth payer to increase your limit");

    signvals_table_by_scope.emplace(caller, [&](auto& rec) {
        rec.signing_value = signing_value;
    });

    jobs_table.emplace(caller, [&](auto& rec) {
        rec.id = next_job_id;
        rec.assoc_id = assoc_id;
        rec.signing_value = signing_value;
        rec.caller = caller;
    });
    inc_job_count(caller);

    // record the signing value in the old way for backwards compatibility with v1 dependant contracts
    action(
      {v1_ram_account, "active"_n},
      get_self(), "v1rrcompat"_n,
      std::tuple(signing_value))
      .send();
}

ACTION orng::setrand(uint64_t job_id, const string& random_value) {
    require_auth("oracle.wax"_n);
    check(!is_paused(), "Contract is paused");

    int64_t running_mode = get_config(running_mode_index, ORACLE_MODE);
    check(running_mode == ORACLE_MODE, "RNG is running not running oracle mode");

    auto job_it = jobs_table.find(job_id);
    check(job_it != jobs_table.end(), "Could not find job id.");

    uint64_t sig_val{job_it->signing_value};

    std::string exponent;
    std::string modulus;

    auto bylast_idx = sigpubkey_table.get_index<"bylast"_n>();
    auto bylast_lowerbound_job_id_itr = bylast_idx.lower_bound(job_id);
    check(bylast_lowerbound_job_id_itr != bylast_idx.end(), "sanity check: can not find key for job id");
    exponent = bylast_lowerbound_job_id_itr->exponent;
    modulus = bylast_lowerbound_job_id_itr->modulus;

    check(verify_rsa_sha256_sig(
            &sig_val, sizeof(sig_val), random_value, exponent, modulus),
            "Could not verify signature.");

    checksum256 rv_hash = sha256(random_value.data(), random_value.size());

    action(
        {get_self(), "active"_n},
        job_it->caller, "receiverand"_n,
        std::tuple(job_it->assoc_id, rv_hash))
        .send();

    dec_job_count(job_it->caller);
    jobs_table.erase(job_it);
}

ACTION orng::setranddecen(eosio::name resolver, uint64_t job_id, const string& random_value) {
    require_auth(resolver);
    check(!is_paused(), "Contract is paused");

    int64_t running_mode = get_config(running_mode_index, ORACLE_MODE);
    check(running_mode == DECENTRALIZE_MODE, "RNG is not running decentralize mode");

    auto job_it = jobs_table.find(job_id);
    check(job_it != jobs_table.end(), "Could not find job id.");
    check(job_it->final_hash == checksum256(), "Job already resolved");

    uint64_t sig_val{job_it->signing_value};

    resolveepoch();
    auto epoch = epoch_table.get();
    auto resolvers = epoch.resolvers;

    check(resolvers.size() > 0, "unable to find resolvers for this epoch");

    check(std::find(resolvers.begin(), resolvers.end(), resolver) != resolvers.end(), "Node is not a valid resolver for this epoch");

    auto bylast_idx = sigpubkey_table.get_index<"bylast"_n>();
    // find increament key id by job id using self scope sigpubkey_table
    auto bylast_lowerbound_job_id_itr = bylast_idx.lower_bound(job_id);
    check(bylast_lowerbound_job_id_itr != bylast_idx.end(), "sanity check: can not find key for job id");
    uint64_t key_id = bylast_lowerbound_job_id_itr->id;

    // find specific signing key of resolver by increament key id
    sigpubkey_table_type sigpubkey_node_table(get_self(), resolver.value);
    auto resolver_key = sigpubkey_node_table.require_find(key_id, "node has no available key");

    std::string exponent = resolver_key->exponent;
    std::string modulus  = resolver_key->modulus;

    check(verify_rsa_sha256_sig(
            &sig_val, sizeof(sig_val), random_value, exponent, modulus),
            "Could not verify signature.");

    checksum256 rv_hash = sha256(random_value.data(), random_value.size());

    vector<JobSeed> resolver_seeds = job_it->resolver_seeds;
    if (job_it->last_resolve_epoch == epoch.id) {
        auto lower = std::lower_bound(resolver_seeds.begin(), resolver_seeds.end(), resolver,
            [](const JobSeed& rs, eosio::name target)
            {
                return rs.resolver.value < target.value;
            }
        );
        check(lower == resolver_seeds.end() || lower->resolver != resolver, "Already submit seed for this job");
        resolver_seeds.insert(lower, { resolver, rv_hash});
    } else {
        // if previous epoch can not resolve job, clear previous seeds and submit again in this epoch
        resolver_seeds.clear();
        resolver_seeds.push_back({ resolver, rv_hash});
    }

    auto decenconfig_record = decentralize_config_table.get();
    if (resolver_seeds.size() == decenconfig_record.number_of_seed) {
        char buf[32*resolver_seeds.size()];
        for (int i = 0; i < resolver_seeds.size(); i++) {
            auto seed_to_verify = resolver_seeds[i].seed.extract_as_byte_array();
            std::memcpy(buf + i*32, &seed_to_verify, 32);
        }
        checksum256 final_hash = sha256(buf, 32*resolver_seeds.size());
        jobs_table.modify(job_it, get_self(), [&](auto& rec) {
            rec.resolver_seeds = resolver_seeds;
            rec.final_hash = final_hash;
        });
    } else {
        jobs_table.modify(job_it, get_self(), [&](auto& rec) {
            rec.resolver_seeds = resolver_seeds;
            rec.last_resolve_epoch = epoch.id;
        });
    }
}

ACTION orng::executejob(uint64_t job_id) {
    check(!is_paused(), "Contract is paused");

    int64_t running_mode = get_config(running_mode_index, ORACLE_MODE);
    check(running_mode == DECENTRALIZE_MODE, "RNG is not running decentralize mode");

    auto job_it = jobs_table.find(job_id);
    check(job_it != jobs_table.end(), "Could not find job id.");

    check(job_it->final_hash != checksum256(), "Job has not been resolved yet");

    action(
        {get_self(), "active"_n},
        job_it->caller, "receiverand"_n,
        std::tuple(job_it->assoc_id, job_it->final_hash))
        .send();
    
    complete_job(job_it);
}

ACTION orng::killjobs(const std::vector<uint64_t>& job_ids) {
    require_auth("oracle.wax"_n);

    int64_t running_mode = get_config(running_mode_index, ORACLE_MODE);
    check(running_mode == ORACLE_MODE, "RNG is not running oracle mode");

    for (const auto& id : job_ids) {
        auto job_it = jobs_table.find(id);
        if (job_it != jobs_table.end()) {
            dec_job_count(job_it->caller);
            jobs_table.erase(job_it);
        }
    }
}

ACTION orng::jobsfail(eosio::name resolver, const std::vector<uint64_t>& job_ids) {
    require_auth(resolver);
    check(!is_paused(), "Contract is paused");

    int64_t running_mode = get_config(running_mode_index, ORACLE_MODE);
    check(running_mode == DECENTRALIZE_MODE, "RNG is not running decentralize mode");

    resolveepoch();

    auto epoch = epoch_table.get();
    auto resolvers = epoch.resolvers;
    check(resolvers.size() > 0, "unable to find resolvers for this epoch");
    check(std::find(resolvers.begin(), resolvers.end(), resolver) != resolvers.end(), "Node is not a valid resolver for this epoch");

    for (const auto& id : job_ids) {
        auto job_it = jobs_table.find (id);
        if (job_it != jobs_table.end()) {
            vector<name> job_resolvers_fail = job_it->resolvers_fail;
            if (job_it->last_fail_epoch == epoch.id) {
                check(std::find(job_resolvers_fail.begin(), job_resolvers_fail.end(), resolver) == job_resolvers_fail.end(), "Already submit fail for this job");
                job_resolvers_fail.push_back(resolver);
            } else {
                // reset the list of resolver that failed to execute job if next epoch is comming without finish this job
                job_resolvers_fail = {resolver};
            }

            if (job_resolvers_fail.size() == epoch.resolvers.size()) {
                complete_job(job_it);
            } else {
                jobs_table.modify(job_it, get_self(), [&](auto& rec) {
                    rec.resolvers_fail = job_resolvers_fail;
                    rec.last_fail_epoch = epoch.id;
                });
            }
        }
    }
}

ACTION orng::setchance(uint64_t chance_to_switch) {
    require_auth("oracle.wax"_n);
    check(!is_paused(), "Contract is paused");

    check(chance_to_switch >= 1, "The chance must be great then 1");
    auto pubconfig = sigpubconfig_table.get();
    pubconfig.chance_to_switch = chance_to_switch;
    sigpubconfig_table.set(pubconfig, _self);
}

ACTION orng::setsigpubkey(uint64_t id,
                          const std::string& exponent,
                          const std::string& modulus) {
    require_auth("oracle.wax"_n);
    check(!is_paused(), "Contract is paused");

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
        check(id >= pubconfig.active_key_index, "only allow set ket for the next keys");
        check(id == pubconfig.available_key_counter, "make sure the next key in order");
        pubconfig.available_key_counter += 1;
        sigpubconfig_table.set(pubconfig, get_self());
    }

    auto pubkey_hash_id = hash_to_int(sha256(const_cast<char*>(modulus.c_str()), modulus.size()));
    auto byhash_idx = sigpubkey_table.get_index<"byhashid"_n>();
    auto byhash_itr = byhash_idx.find(pubkey_hash_id);
    check(byhash_itr == byhash_idx.end(), "public key already exist");

    auto it = sigpubkey_table.find(id);
    check(it == sigpubkey_table.end(), "key with this id has already exsited");

    if (it == sigpubkey_table.end()) {
        sigpubkey_table.emplace(get_self(), [&](auto& rec) {
            rec.id = id;
            rec.pubkey_hash_id = pubkey_hash_id;
            rec.exponent = exponent;
            rec.modulus = modulus;
        });
    } else {
        sigpubkey_table.modify(it, get_self(), [&](auto& rec) {
            rec.pubkey_hash_id = pubkey_hash_id;
            rec.exponent = exponent;
            rec.modulus = modulus;
        });
    }
}

ACTION orng::setnodpubkey(const eosio::name& owner,
                          uint64_t id,
                          const std::string& exponent,
                          const std::string& modulus) {
    require_auth(owner);
    require_top21_producers(owner);
    check(!is_paused(), "Contract is paused");

    check(modulus.size() > 0, "modulus must have non-zero length");
    check(modulus[0] != '0', "modulus must have leading zeroes stripped");

    auto pubconfig = sigpubconfig_table.get();
    sigpubkey_table_type sigpubkey_node_table(get_self(), owner.value);
    if (sigpubkey_node_table.begin() == sigpubkey_node_table.end()) {
        check(id == pubconfig.active_key_index, "please set active key first");
    } else {
        auto last_sigpubkey = sigpubkey_node_table.rbegin();
        check(id == last_sigpubkey->id + 1, "make sure the next key in order");
    }

    auto pubkey_hash_id = hash_to_int(sha256(const_cast<char*>(modulus.c_str()), modulus.size()));

    auto byhash_idx = sigpubkey_node_table.get_index<"byhashid"_n>();
    auto byhash_itr = byhash_idx.find(pubkey_hash_id);
    check(byhash_itr == byhash_idx.end(), "public key already exist");

    sigpubkey_node_table.emplace(owner, [&](auto& rec) {
        rec.id = id;
        rec.pubkey_hash_id = pubkey_hash_id;
        rec.exponent = exponent;
        rec.modulus = modulus;
    });
}

ACTION orng::cleansigvals(uint64_t scope, uint64_t rows_num) {
    check(!is_paused(), "Contract is paused");

    if (scope != get_self().value) {
        uint64_t key_id = scope;
        auto key_itr = sigpubkey_table.find(key_id);
        if (key_itr == sigpubkey_table.end()) {
            auto byhash_idx = sigpubkey_table.get_index<"byhashid"_n>();
            auto byhash_itr = byhash_idx.find(scope);
            key_id = byhash_itr->id;
        }
        auto pubconfig = sigpubconfig_table.get();
        check(key_id < pubconfig.active_key_index, "only allow clean the signvals that was singed by old keys");
    }
    signvals_table_type signvals_table_by_scope(get_self(), scope);

    auto itr = signvals_table_by_scope.begin();
    while (itr != signvals_table_by_scope.end() && rows_num > 0) {
        auto _itr = itr;
        itr = signvals_table_by_scope.erase(_itr);
        auto v1_itr = signvals_table_v1_support.find(_itr->signing_value);
        if (v1_itr != signvals_table_v1_support.end()) {
          // the signing value was placed in the table under self scope to support contracts that still require the legacy tracking
          signvals_table_v1_support.erase(v1_itr);
        }
        --rows_num;
    }
}

ACTION orng::setmaxjobs(const eosio::name& dapp, uint64_t max_jobs) {
  require_auth(get_self());

  auto max_jobs_it = max_jobs_table.find(dapp.value);
  if (max_jobs_it != max_jobs_table.end()) {
    if(max_jobs == unset_max_jobs) {
      max_jobs_table.erase(max_jobs_it);
    } else {
      max_jobs_table.modify(max_jobs_it, same_payer, [&](auto& rec) {
        rec.max_jobs_allowed = max_jobs;
      });
    }
  } else {
    max_jobs_table.emplace(get_self(), [&](auto& rec) {
      rec.dapp = dapp;
      rec.max_jobs_allowed = max_jobs;
    });
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

ACTION orng::decenconfig(uint64_t epoch_duration, uint64_t number_of_resolver, uint64_t number_of_seed, uint64_t min_active_node) {
    require_auth(get_self());

    check(min_active_node < 21, "min_active_node must be less than 21");
    check(min_active_node > number_of_resolver, "min_active_node must be greater than number_of_resolver");
    check(number_of_seed <= number_of_resolver, "number_of_seed must be less than or equal to number_of_resolver");

    if (!decentralize_config_table.exists()) {
        decentralize_config decenconfig_record;
        decenconfig_record.epoch_duration = epoch_duration;
        decenconfig_record.number_of_resolver = number_of_resolver;
        decenconfig_record.number_of_seed = number_of_seed;
        decenconfig_record.min_active_node = min_active_node;
        decenconfig_record.total_reward = 0;
        decenconfig_record.total_processed_jobs = 0;
        decentralize_config_table.get_or_create(get_self(), decenconfig_record);
    } else {
        auto decenconfig_record = decentralize_config_table.get();
        decenconfig_record.epoch_duration = epoch_duration;
        decenconfig_record.number_of_resolver = number_of_resolver;
        decenconfig_record.number_of_seed = number_of_seed;
        decenconfig_record.min_active_node = min_active_node;
        decentralize_config_table.set(decenconfig_record, get_self());
    }
}

/*
  Each epoch, node has three tasks:
  1. submit random seed for epoch N if node is chosen to be resolver
  2. submit signature for epoch N + 1
  3. submit epoch seed for epoch N + 2
*/
ACTION orng::nodeping(const eosio::name& owner, eosio::checksum256 seed) {
    check(!is_paused(), "Contract is paused");
    require_auth(owner);

    int64_t running_mode = get_config(running_mode_index, ORACLE_MODE);
    check(running_mode == DECENTRALIZE_MODE, "RNG is not running decentralize mode");

    require_top21_producers(owner);

    auto decentralize_config = decentralize_config_table.get();

    sigpubkey_table_type sigpubkey_node_table(get_self(), owner.value);
    check(sigpubkey_node_table.begin() != sigpubkey_node_table.end(), "Please update public key");

    auto pubconfig = sigpubconfig_table.get();
    auto node_last_pubkey = sigpubkey_node_table.rbegin();
    check (node_last_pubkey->id > pubconfig.active_key_index, "Please make sure node has more than 2 available public key");

    resolveepoch();
    auto epoch_seed = epoch_seed_table.get();

    vector<EpochSeed> epoch_seeds = epoch_seed.seeds;
    auto lower = std::lower_bound( epoch_seed.seeds.begin(),  epoch_seed.seeds.end(), owner,
        [](const EpochSeed& rs, eosio::name target)
        {
            return rs.node.value < target.value;
        }
    );
    check(lower == epoch_seed.seeds.end() || lower->node != owner, "already submit seed for next epoch");
    epoch_seed.seeds.insert(lower, { owner, seed, std::string("")});
    epoch_seed_table.set(epoch_seed, get_self());
}

ACTION orng::nodesignature(const eosio::name& owner, const std::string& signature) {
    check(!is_paused(), "Contract is paused");
    require_auth(owner);

    int64_t running_mode = get_config(running_mode_index, ORACLE_MODE);
    check(running_mode == DECENTRALIZE_MODE, "RNG is not running decentralize mode");

    resolveepoch();

    uint32_t current_time = current_time_point().sec_since_epoch();
    auto epoch_signature = epoch_signature_table.get_or_default();
    check(!epoch_signature.is_ended(current_time), "Current singature phase is ended");

    auto epoch_seed_itr = std::find_if(epoch_signature.seeds.begin(), epoch_signature.seeds.end(), [&owner](const EpochSeed& obj) {
        return obj.node == owner;
    });
    check(epoch_seed_itr != epoch_signature.seeds.end(), "Node seed for next epoch not found");

    auto pubconfig = sigpubconfig_table.get();
    sigpubkey_table_type sigpubkey_node_table(get_self(), owner.value);
    auto resolver_key = sigpubkey_node_table.require_find(pubconfig.active_key_index, "node has no available key");
    check(epoch_seed_itr->signature == "", "seed signature already submited");

    std::string exponent = resolver_key->exponent;
    std::string modulus  = resolver_key->modulus;
    auto seed_to_verify = epoch_seed_itr->seed.extract_as_byte_array();
    check(verify_rsa_sha256_sig(
            &seed_to_verify, 32, signature, exponent, modulus),
            "Could not verify signature.");

    epoch_seed_itr->signature = signature;
    epoch_signature_table.set(epoch_signature, get_self());
}

ACTION orng::claimreward(const eosio::name& owner) {
    check(!is_paused(), "Contract is paused");
    require_auth(owner);

    auto node_itr = node_table.require_find(owner.value, "Node not found");

    check(node_itr->job_count > 0, "node has no reward");

    auto decentralize_config = decentralize_config_table.get();
    uint64_t total_reward = decentralize_config.total_reward;
    uint64_t total_processed_jobs = decentralize_config.total_processed_jobs;

    uint64_t reward = (node_itr->job_count*total_reward)/total_processed_jobs;
    check(reward > 0, "node has no reward" + to_string(reward));

    decentralize_config.total_reward -= reward;
    decentralize_config.total_processed_jobs -= node_itr->job_count;
    decentralize_config_table.set(decentralize_config, get_self());
    
    node_table.modify(node_itr, same_payer, [&](auto& n) {
        n.job_count = 0;
    });

    action(
        {get_self(), "active"_n},
        "eosio.token"_n, "transfer"_n,
        std::tuple(get_self(), owner, asset(reward, WAX_SYMBOL), string("RNG reward"))
    ).send();
}

void orng::on_token_transfer(const eosio::name &from, const eosio::name &to, const eosio::asset &quantity,
                                const std::string &memo) {
    check(!is_paused(), "Contract is paused");
    auto code = get_first_receiver();
    check(code == "eosio.token"_n, "Invalid token contract");

    if (from == get_self() || to != get_self())
    {
        return;
    }

    check (memo.compare("reward") == 0, "Only reward deposit are allow");

    auto decenconfig_record = decentralize_config_table.get();
    decenconfig_record.total_reward += quantity.amount;
    decentralize_config_table.set(decenconfig_record, get_self());
}

ACTION orng::resolveepoch() {
    auto decentralize_config = decentralize_config_table.get();
    uint64_t epoch_duration = decentralize_config.epoch_duration;

    auto epoch = epoch_table.get_or_default();
    auto epoch_seed  = epoch_seed_table.get_or_default();
    auto epoch_signature  = epoch_signature_table.get_or_default();
    uint32_t current_time = current_time_point().sec_since_epoch();

    // reset list of resolvers if epoch ended
    // list will be re-calculated again base on seed signatures if all conditions are met
    // epoch resolvers may empty if not enough node active
    if (epoch.is_ended(current_time)) {
        epoch.resolvers.clear();
        epoch.end_time = 0;
        epoch_table.set(epoch, get_self());
    }

    if (epoch_signature.is_ended(current_time)) {
        // choose resolver base on signature if it is not outdated
        if (!epoch_signature.is_outdate(current_time)) {
            vector<EpochSeed> valid_seeds;
            for (auto s: epoch_signature.seeds) {
                if (s.signature != "") {
                    valid_seeds.push_back(s);
                }
            }
            uint8_t number_active_node = valid_seeds.size();
            uint64_t number_of_resolver = decentralize_config.number_of_resolver;
            uint64_t mimimum_active_node = decentralize_config.min_active_node;
            if (number_active_node >= mimimum_active_node) {
                char buf[512*number_active_node];
                concat_signature(buf, valid_seeds);
                eosio::checksum256 final_seed = eosio::sha256(buf, 512*number_active_node);

                epoch.resolvers = orng::pick_resolvers(valid_seeds, number_of_resolver, final_seed);
                epoch.end_time = epoch_signature.resolve_deadline;
                epoch.id = epoch_signature.id;
                epoch_table.set(epoch, get_self());
            }
        }
        epoch_signature.seeds.clear();
        epoch_signature.end_submit_signature_time = 0;
        epoch_signature.resolve_deadline = 0;
        epoch_signature_table.set(epoch_signature, get_self());
    }

    if (epoch_seed.is_ended(current_time)) {
        if (epoch_seed.is_outdate(current_time)) {
            epoch_seed.end_submit_seed_time = current_time + epoch_duration;
            epoch_seed.submit_signature_deadline = current_time + 2*epoch_duration;
        } else {
            // list of seed move to next phase (signature phase)
            epoch_signature.id = epoch_seed.id;
            epoch_signature.seeds = epoch_seed.seeds;
            epoch_signature.end_submit_signature_time = epoch_seed.submit_signature_deadline;
            epoch_signature.resolve_deadline = epoch_seed.submit_signature_deadline + epoch_duration;

            epoch_seed.end_submit_seed_time = epoch_seed.submit_signature_deadline;
            epoch_seed.submit_signature_deadline = epoch_seed.submit_signature_deadline + epoch_duration;
            epoch_signature_table.set(epoch_signature, get_self());
        }
        epoch_seed.id++;
        epoch_seed.seeds.clear();
        epoch_seed_table.set(epoch_seed, get_self());
    }
}

bool orng::is_paused() const {
    return get_config(paused_index, false);
}

bool orng::is_paused_request() const {
    return get_config(paused_request_row, false);
}

/**
* pick resolver from list of active node base on concatenated signatures hash
* 1. set offset zero
* 2. loop through each byte of hash
* 3. choose node index deternmine by (byte_hash + offset) / number_of_active_nodes
* 4. If loop through all hash byte but still can not find enough resolver increase offset and do step 2-4 again
* @param seeds list of active node names, these random seeds and signatures
* @param number_of_resolver number of node to be chosen
* @param hash concat signatures hash
*/
vector<name> orng::pick_resolvers(vector<EpochSeed> seeds, int64_t number_of_resolver, checksum256 hash) {
    vector<eosio::name> resolvers;
    int64_t number_of_active_nodes = seeds.size();

    check(number_of_active_nodes > number_of_resolver, "number of resolver greater than number of active node");
    const auto bytes = hash.extract_as_byte_array();
    uint32_t offset = 0;
    while(resolvers.size() < number_of_resolver) {
        for (int i = 0; i < 32; i++) {
            uint8_t index = (bytes.at(i) + offset) % number_of_active_nodes;
            if (std::find(resolvers.begin(), resolvers.end(), seeds[index].node) == resolvers.end()) {
                resolvers.push_back(seeds[index].node);
            }
            if (resolvers.size() == number_of_resolver) {
                break;
            }
        }
        offset++;
    }

    return resolvers;
}

void orng::require_top21_producers(const eosio::name& node) {
    producers_table _producers("eosio"_n, "eosio"_n.value);
    auto idx = _producers.get_index<"prototalvote"_n>();

    uint8_t top_count = 0;
    for( auto it = idx.cbegin(); it != idx.cend() && top_count < 21 && 0 < it->total_votes && it->active(); ++it ) {
        if (it->owner == node) {
            return;
        }
        top_count++;
    }
    check(false, "Node is not top 21 producers");
}

void orng::complete_job(jobs_table_type::const_iterator job_it) {
    for (auto rs : job_it->resolver_seeds) {
        auto resolver_node_itr = node_table.find(rs.resolver.value);
        if (resolver_node_itr != node_table.end()) {
            node_table.modify(resolver_node_itr, same_payer, [&](auto& n) {
                n.job_count  += 1;
            });
        } else {
            node_table.emplace(get_self(), [&](auto& n) {
                n.owner      = rs.resolver;
                n.job_count  = 1;
            }); 
        }
    }
    auto decenconfig_record = decentralize_config_table.get();
    decenconfig_record.total_processed_jobs += job_it->resolver_seeds.size();
    decentralize_config_table.set(decenconfig_record, get_self());

    dec_job_count(job_it->caller);
    jobs_table.erase(job_it);   
}

uint64_t orng::get_job_count(const name& dapp) const {
  auto jobs_count_it = jobs_count_table.find(dapp.value);
  if (jobs_count_it != jobs_count_table.end()) {
    return jobs_count_it->num_jobs_in_q;
  }
  return 0;
}

void orng::inc_job_count(const name& dapp) {
  auto jobs_count_it = jobs_count_table.find(dapp.value);
  if (jobs_count_it != jobs_count_table.end()) {
    jobs_count_table.modify(jobs_count_it, same_payer, [&](auto& rec) {
      rec.num_jobs_in_q++;
    });
  } else {
    jobs_count_table.emplace(dapp, [&](auto& rec) {
      rec.dapp = dapp;
      rec.num_jobs_in_q = 1;
    });
  }
}

void orng::dec_job_count(const name& dapp) {
  auto jobs_count_it = jobs_count_table.find(dapp.value);
  if (jobs_count_it != jobs_count_table.end() && jobs_count_it->num_jobs_in_q > 0) {
    jobs_count_table.modify(jobs_count_it, same_payer, [&](auto& rec) {
      rec.num_jobs_in_q--;
    });
  }
}

uint64_t orng::get_max_jobs(const name& dapp) const {
  // 1. Check for an override maximum q size for this dapp
  auto max_jobs_it = max_jobs_table.find(dapp.value);
  if (max_jobs_it != max_jobs_table.end()) {
    return max_jobs_it->max_jobs_allowed;
  }

  // 2. Check if the account has bandwidth paid for it
  auto bwpayer_it = bwpayers_table.find(dapp.value);
  if(bwpayer_it != bwpayers_table.end() && bwpayer_it->accepted) {
    return get_config(bwpaid_max_jobs, DEFAULT_BWPAYER_MAX_JOBS);
  }

  // 3. The account is in the free tier
  return get_config(free_max_jobs, DEFAULT_FREE_MAX_JOBS);
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
    int64_t index_val = get_config(jobid_index, 0);
    set_config(jobid_index, index_val + 1);
    return index_val;
}

uint64_t orng::update_current_public_key(uint64_t job_id) {
    auto pubconfig = sigpubconfig_table.get();
    auto it = sigpubkey_table.require_find(pubconfig.active_key_index, "sanity check");
    if (it->last == 0 && pubconfig.active_key_index == 0) {
        sigpubkey_table.modify(it, get_self(), [&](auto& rec) {
            rec.last = job_id + pubconfig.chance_to_switch - 1;
        });
    }

    if (it->last < job_id) {
        pubconfig.active_key_index += 1;
        sigpubconfig_table.set(pubconfig, get_self());
        // check(pubconfig.active_key_index < pubconfig.available_key_counter, "admin: no available public-key");
        auto next_key_it = sigpubkey_table.find(pubconfig.active_key_index);
        if (next_key_it == sigpubkey_table.end()) {
            // store empty key in self scope to find key id by last job id
            sigpubkey_table.emplace(get_self(), [&](auto& rec) {
                rec.id = pubconfig.active_key_index;
                rec.pubkey_hash_id = 0;
                rec.exponent = "";
                rec.modulus = "";
                rec.last = job_id + pubconfig.chance_to_switch - 1;
            });
        } else {
            sigpubkey_table.modify(next_key_it, get_self(), [&](auto& rec) {
                rec.last = job_id + pubconfig.chance_to_switch - 1;
            });
        }
        return next_key_it->id;
    }

    return it->id;
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