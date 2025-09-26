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

#include "dicegame.hpp"

static constexpr uint64_t last_roll_id_index = "lastrollid"_n.value;

void dicegame::init(name player) {
    require_auth(player);
    
    playerstats_table stats(get_self(), get_self().value);
    auto stats_it = stats.find(player.value);
    
    if (stats_it == stats.end()) {
        stats.emplace(player, [&](auto& s) {
            s.player = player;
            s.last_roll_time = current_time_point();
        });
        print("Player ", player, " initialized");
    } else {
        print("Player ", player, " already exists");
    }
}

void dicegame::rolldie(name player) {
    require_auth(player);
    
    // Initialize player if not exists
    playerstats_table stats(get_self(), get_self().value);
    auto stats_it = stats.find(player.value);
    if (stats_it == stats.end()) {
        init(player);
    }
    
    // Generate unique roll_id for coordination
    dierolls_table rolls(get_self(), get_self().value);
    uint64_t roll_id = get_config(last_roll_id_index, 0) + 1;
    set_config(last_roll_id_index, roll_id);
    
    // Store pending roll
    rolls.emplace(player, [&](auto& r) {
        r.roll_id = roll_id;
        r.player = player;
        r.timestamp = current_time_point();
    });
    
    // Use transaction hash as seed for guaranteed uniqueness
    auto tx_hash = _get_transaction_hash();
    uint64_t seed = _hash_to_int(tx_hash);
    
    print("Player ", player, " rolling die (roll_id: ", roll_id, ", seed: ", seed, ")");
    
    // Request random number with roll_id as assoc_id
    action{
        permission_level{get_self(), "active"_n},
        "orng.wax"_n, "requestrand"_n,
        std::make_tuple(roll_id, seed, get_self())
    }.send();
}

void dicegame::receiverand(uint64_t assoc_id, const checksum256& random_value) {
    require_auth("orng.wax"_n);

    print("Received random value for roll_id: ", assoc_id);

    // Find the pending roll using assoc_id (roll_id)
    dierolls_table rolls(get_self(), get_self().value);
    auto roll_it = rolls.find(assoc_id);
    check(roll_it != rolls.end(), "Roll not found for assoc_id: " + std::to_string(assoc_id));

    // Calculate resolution time before processing
    auto current_time = current_time_point();
    uint32_t resolve_time = current_time.sec_since_epoch() - roll_it->timestamp.sec_since_epoch();

    // Extract random bytes and use them
    uint64_t rand_num = _hash_to_int(random_value);

    // Roll die (1-6)
    uint32_t die_result = (rand_num % 6) + 1;

    print("Random value generated die result: ", die_result, " for player: ", roll_it->player);

    // Process the result with resolution time
    handle_die_result(roll_it->player, roll_it->roll_id, die_result, resolve_time);

    // Log the resolution time
    logtime(assoc_id, roll_it->player, resolve_time);

    // Clean up completed roll
    rolls.erase(roll_it);
}

void dicegame::getstats(name player) {
    playerstats_table stats(get_self(), get_self().value);
    auto stats_it = stats.find(player.value);
    
    if (stats_it == stats.end()) {
        print("Player ", player, " not found. Use 'init' action first.");
        return;
    }
    
    print("=== Stats for ", player, " ===\n");
    print("Total rolls: ", stats_it->total_rolls, "\n");
    print("Last roll: ", stats_it->last_roll, "\n");
    print("Average resolution time: ", stats_it->avg_time, " seconds\n");
    print("Distribution:\n");
    print("  1s: ", stats_it->ones, "\n");
    print("  2s: ", stats_it->twos, "\n");
    print("  3s: ", stats_it->threes, "\n");
    print("  4s: ", stats_it->fours, "\n");
    print("  5s: ", stats_it->fives, "\n");
    print("  6s: ", stats_it->sixes, "\n");
}

void dicegame::reset() {
    require_auth(get_self());
    
    // Clear all tables
    playerstats_table stats(get_self(), get_self().value);
    auto stats_it = stats.begin();
    while (stats_it != stats.end()) {
        stats_it = stats.erase(stats_it);
    }
    
    dierolls_table rolls(get_self(), get_self().value);
    auto rolls_it = rolls.begin();
    while (rolls_it != rolls.end()) {
        rolls_it = rolls.erase(rolls_it);
    }
    
    rollhistory_table history(get_self(), get_self().value);
    auto history_it = history.begin();
    while (history_it != history.end()) {
        history_it = history.erase(history_it);
    }
    
    print("All data reset");
}

void dicegame::setconfig(eosio::name config, int64_t value) {
    require_auth(get_self());
    set_config(config.value, value);
    print("Config ", config, " set to ", value);
}

void dicegame::getconfig(eosio::name config) {
    int64_t value = get_config(config.value, -1);
    print("Config ", config, " value: ", value);
}

void dicegame::logtime(uint64_t assoc_id, name player, uint32_t resolve_time) {
}

void dicegame::handle_die_result(name player, uint64_t roll_id, uint32_t result, uint32_t resolve_time) {
    // Update player statistics
    playerstats_table stats(get_self(), get_self().value);
    auto stats_it = stats.find(player.value);
    check(stats_it != stats.end(), "Player stats not found");

    stats.modify(stats_it, same_payer, [&](auto& s) {
        s.total_rolls++;
        s.last_roll = result;
        s.last_roll_time = current_time_point();

        // Calculate new average time using running average formula
        if (s.total_rolls == 1) {
            s.avg_time = resolve_time;
        } else {
            // new_avg = ((old_avg * (count-1)) + new_time) / count
            uint64_t total_time = (uint64_t)s.avg_time * (s.total_rolls - 1) + resolve_time;
            s.avg_time = total_time / s.total_rolls;
        }

        // Update distribution counters
        switch(result) {
            case 1: s.ones++; break;
            case 2: s.twos++; break;
            case 3: s.threes++; break;
            case 4: s.fours++; break;
            case 5: s.fives++; break;
            case 6: s.sixes++; break;
        }
    });

    // Store in roll history
    rollhistory_table history(get_self(), get_self().value);
    history.emplace(get_self(), [&](auto& h) {
        h.id = history.available_primary_key();
        h.player = player;
        h.roll_id = roll_id;
        h.result = result;
        h.timestamp = current_time_point();
        h.resolve_time = resolve_time;
    });

    print("Die roll complete: Player ", player, " rolled a ", result, " (resolved in ", resolve_time, "s)");
}

void dicegame::set_config(uint64_t name, int64_t value) {
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

int64_t dicegame::get_config(uint64_t name, int64_t default_value) const {
    auto it = config_table.find(name);
    if (it == config_table.end())
        return default_value;
    return it->value;
}