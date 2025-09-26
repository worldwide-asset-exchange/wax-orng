// MIT License
//
// Copyright (c) 2025 worldwide-asset-exchange
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

#include <eosio/eosio.hpp>
#include <eosio/crypto.hpp>
#include <eosio/transaction.hpp>
#include <eosio/asset.hpp>
#include <eosio/time.hpp>

using namespace eosio;

class [[eosio::contract("dicegame")]] dicegame : public contract {
public:
    using contract::contract;

    /**
     * Initialize player account
     */
    [[eosio::action]]
    void init(name player);

    /**
     * Player rolls a die
     */
    [[eosio::action]]
    void rolldie(name player);

    /**
     * Callback to receive random value from orng.wax
     */
    [[eosio::action]]
    void receiverand(uint64_t assoc_id, const checksum256& random_value);

    /**
     * Get player stats
     */
    [[eosio::action]]
    void getstats(name player);

    /**
     * Reset all data (for testing)
     */
    [[eosio::action]]
    void reset();

    /**
     * Set configuration value
     */
    [[eosio::action]]
    void setconfig(eosio::name config, int64_t value);

    /**
     * Get configuration value
     */
    [[eosio::action]]
    void getconfig(eosio::name config);

    /**
     * Log resolution time for a specific roll
     */
    [[eosio::action]]
    void logtime(uint64_t assoc_id, name player, uint32_t resolve_time);

private:
    // Configuration table
    struct [[eosio::table]] config {
        uint64_t name;
        int64_t value;

        uint64_t primary_key() const { return name; }
    };
    using config_table_type = multi_index<"config"_n, config>;
    // Table to track pending die rolls
    struct [[eosio::table]] dieroll {
        uint64_t roll_id;
        name player;
        time_point_sec timestamp;
        
        uint64_t primary_key() const { return roll_id; }
        uint64_t by_player() const { return player.value; }
    };
    using dierolls_table = multi_index<"dierolls"_n, dieroll,
        indexed_by<"byplayer"_n, const_mem_fun<dieroll, uint64_t, &dieroll::by_player>>>;

    // Table to track player statistics
    struct [[eosio::table]] playerstats {
        name player;
        uint32_t total_rolls = 0;
        uint32_t ones = 0;
        uint32_t twos = 0;
        uint32_t threes = 0;
        uint32_t fours = 0;
        uint32_t fives = 0;
        uint32_t sixes = 0;
        uint32_t last_roll = 0;
        time_point_sec last_roll_time;
        uint32_t avg_time = 0;

        uint64_t primary_key() const { return player.value; }
    };
    using playerstats_table = multi_index<"playerstats1"_n, playerstats>;

    // Table to track roll results for history
    struct [[eosio::table]] rollhistory {
        uint64_t id;
        name player;
        uint64_t roll_id;
        uint32_t result;
        time_point_sec timestamp;
        uint32_t resolve_time;

        uint64_t primary_key() const { return id; }
        uint64_t by_player() const { return player.value; }
        uint64_t by_roll_id() const { return roll_id; }
    };
    using rollhistory_table = multi_index<"rollhistory1"_n, rollhistory,
        indexed_by<"byplayer"_n, const_mem_fun<rollhistory, uint64_t, &rollhistory::by_player>>,
        indexed_by<"byrollid"_n, const_mem_fun<rollhistory, uint64_t, &rollhistory::by_roll_id>>>;

    void handle_die_result(name player, uint64_t roll_id, uint32_t result, uint32_t resolve_time);

    // Config management helpers
    void set_config(uint64_t name, int64_t value);
    int64_t get_config(uint64_t name, int64_t default_value) const;

    config_table_type config_table{get_self(), get_self().value};

    static checksum256 _get_transaction_hash() {
        size_t size = eosio::transaction_size();
        char buf[size];
        uint32_t read = eosio::read_transaction(buf, size);
        eosio::check(size == read, "read_transaction() has failed.");
        return eosio::sha256(buf, read);
    }
    
    static uint64_t _hash_to_int(const checksum256& hash) {
        auto hash_bytes = hash.extract_as_byte_array();
        uint64_t result = 0;
        for(int i = 0; i < 8; i++) {
            result = (result << 8) | hash_bytes[i];
        }
        return result;
    }
};