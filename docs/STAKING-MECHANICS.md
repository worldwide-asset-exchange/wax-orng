# Staking Mechanics Documentation

## Overview

The WAX ORNG v3.0 staking system allows **any account to stake for any dApp**, enabling flexible funding models where users, sponsors, guilds, or the dApp itself can contribute to the dApp's free credit pool. Credits refill automatically based on an **adaptive rate limiting system** that dynamically allocates free capacity based on paid demand.

## Key Design Principles

1. **Flexible Staking**: Anyone can stake for a dApp using memo format `stake-<dapp_name>`
2. **Individual Tracking**: Each staker's contribution is tracked separately
3. **Pooled Benefits**: All stakes for a dApp contribute to that dApp's shared credit pool
4. **Two-Step Unstaking**: Unstake requests have a maturity period before funds can be claimed

## Data Structures

### 1. `acctstate` Table (Scope: orng.wax)
Tracks total stake and credits per dApp:
```cpp
struct acctstate {
    eosio::name dapp;          // dApp account name
    eosio::asset stake;        // TOTAL stake from all users for this dApp
    uint64_t credits;          // Free call credits (refilled via adaptive algorithm)
    eosio::asset fee_balance;  // Pay-per-use balance
    eosio::time_point_sec last_update;
    // ...
}
```

### 2. `userstakes` Table (Scope: dApp account)
Tracks individual user stakes for a specific dApp:
```cpp
struct userstake {
    eosio::name user;          // User who staked
    eosio::asset amount;       // Amount this user staked
    eosio::time_point_sec last_update;
    // Primary key: user.value
}
```

### 3. `unstake` Table (Scope: dApp account)
Tracks pending unstake requests:
```cpp
struct unstakeentry {
    eosio::name user;          // User requesting unstake
    eosio::asset amount;       // Amount to be unstaked
    eosio::time_point_sec request_time;  // When unstake was requested
    // Primary key: user.value
}
```

### 4. `adaptcfg` Singleton (Scope: orng.wax)
Global adaptive rate limiting configuration:
```cpp
struct adaptiveconfig {
    bool adaptive_stake_enabled = true;
    uint32_t total_capacity_calls_per_hr = 18000;     // Maximum system capacity
    uint32_t free_min_calls_per_hr = 900;             // Guaranteed minimum free capacity
    uint32_t headroom_calls_per_hr = 1800;            // Reserved buffer for paid calls
    uint32_t per_dapp_min_calls_per_hr = 10;          // Minimum per dApp (scaled by 100)
    uint32_t burst_window_hours = 100;                // Burst window (scaled by 100)
    uint32_t ema_half_life_sec = 900;                 // EMA half-life (15 minutes)
    uint32_t ema_min_update_sec = 10;                 // Minimum EMA update interval
}
```

### 5. `rngstats` Singleton (Scope: orng.wax)
Real-time paid request rate tracking:
```cpp
struct rngstats {
    double paid_rate_ema_ch = 0.0;                    // Exponential moving average of paid rate
    uint64_t paid_count_window = 0;                   // Paid calls since last EMA update
    eosio::time_point_sec last_ema_update;            // Last EMA calculation time
}
```

### 6. `stakestats` Singleton (Scope: orng.wax)
Total stake aggregation across all dApps:
```cpp
struct stakestats {
    int64_t total_stake_amount = 0;                   // Sum of all stakes from all dApps
}
```

## Adaptive Rate Limiting System

The credit refill system uses an **adaptive algorithm** that dynamically allocates free capacity based on real-time paid demand.

### How It Works

1. **Track Paid Demand**: The system tracks paid calls using an Exponential Moving Average (EMA)
   - Formula: `paid_rate_ema = g * prev_ema + (1-g) * inst_rate`
   - Where: `g = exp(-dt/tau)` and `tau = ema_half_life_sec / ln(2)`
   - Only **paid calls** increment the counter; free calls using credits do not affect EMA

2. **Calculate Free Capacity**:
   ```
   T_free = total_capacity - headroom - paid_rate_ema
   T_free = max(free_min, T_free)  // Ensure minimum free capacity
   ```
   - `total_capacity_calls_per_hr`: Maximum system capacity (default: 18000/hr)
   - `headroom_calls_per_hr`: Buffer reserved for paid calls (default: 1800/hr)
   - `free_min_calls_per_hr`: Guaranteed minimum (default: 900/hr)

3. **Allocate Per-dApp Credits**:
   ```
   rate_dapp = max(per_dapp_min, T_free * (s_dapp / S_total))
   ```
   - Each dApp gets proportional share based on their stake
   - `s_dapp`: Individual dApp's stake amount
   - `S_total`: Total stake across all dApps (from `stakestats`)

### Key Actions

#### `configadptive`
Configure adaptive rate limiting parameters (requires contract authority):
```bash
cleos push action orng.wax configadptive '[
  true,    # adaptive_stake_enabled
  18000,   # total_capacity_calls_per_hr
  900,     # free_min_calls_per_hr
  1800,    # headroom_calls_per_hr
  10,      # per_dapp_min_calls_per_hr
  100,     # burst_window_hours
  900,     # ema_half_life_sec
  10       # ema_min_update_sec
]' -p orng.wax
```

#### `accumstake`
Recalculate total stake across all dApps (updates `stakestats` singleton):
```bash
cleos push action orng.wax accumstake '[]' -p orng.wax
```

**Important**: Run `accumstake` after significant stake changes to ensure accurate credit distribution.

### EMA Update Rules

- **Minimum interval**: EMA only updates if `dt >= ema_min_update_sec` (default: 10 seconds)
- **Window reset**: After EMA update, `paid_count_window` resets to 0
- **Free vs Paid**: Only paid calls affect EMA; free calls (using credits) do not

## Staking Flow

### Transfer Handler
```cpp
// Memo format: "stake-<dapp_name>" or "deposit-<dapp_name>"
void receive_token_transfer(name from, name to, asset quantity, string memo) {
    // Parse memo to extract dApp name
    if (memo.substr(0, 6) == "stake-") {
        string dapp_name = memo.substr(6);
        eosio::name dapp = eosio::name(dapp_name);
        check(is_account(dapp), "dapp account does not exist");
        _stake(from, dapp, quantity);  // 'from' is the staker, 'dapp' is beneficiary
    }
}
```

### Stake Function
```cpp
void _stake(const eosio::name &staker, const eosio::name &dapp, const eosio::asset &quantity) {
    // 1. Update TOTAL dApp stake in acctstate table
    auto it = acct_table.find(dapp.value);
    if (it == acct_table.end()) {
        acct_table.emplace(_self, [&](auto&r){
            r.dapp = dapp;
            r.stake = quantity;
            r.last_update = time_point_sec(current_time_point());
        });
    } else {
        _refill(it);  // Refill credits using adaptive algorithm before modifying stake
        acct_table.modify(it, get_self(), [&](auto&r){
            r.stake += quantity;
        });
    }

    // 2. Track INDIVIDUAL user stake in userstakes table (scoped by dApp)
    userstakes_table_type userstakes_table(get_self(), dapp.value);
    auto user_it = userstakes_table.find(staker.value);
    if (user_it == userstakes_table.end()) {
        userstakes_table.emplace(_self, [&](auto& r) {
            r.user = staker;
            r.amount = quantity;
            r.last_update = time_point_sec(current_time_point());
        });
    } else {
        userstakes_table.modify(user_it, get_self(), [&](auto& r) {
            r.amount += quantity;
            r.last_update = time_point_sec(current_time_point());
        });
    }
}
```

**Key Points:**
- The `staker` can be anyone (user, sponsor, guild, or dApp itself)
- Total stake in `acctstate` determines the dApp's proportional share of free capacity
- Credits refill based on adaptive allocation: `rate_dapp = max(per_dapp_min, T_free * (s_dapp / S_total))`
- Individual stakes are tracked in `userstakes` (scoped by dApp) for unstaking purposes
- Run `accumstake` after stake changes to update `stakestats` for accurate credit distribution

## Unstaking Flow (Two-Step Process)

### Step 1: Request Unstake

```cpp
void unstakeuser(const eosio::name& user, const eosio::name& dapp, const eosio::asset& quantity) {
    require_auth(user);  // User must authorize their own unstake

    // 1. Verify user has sufficient stake
    userstakes_table_type userstakes_table(get_self(), dapp.value);
    auto user_it = userstakes_table.require_find(user.value, "no user stake found for this dapp");
    check(user_it->amount >= quantity, "exceed user staked amount");

    // 2. IMMEDIATELY reduce user's stake (prevents using credits after unstake request)
    if (user_it->amount == quantity) {
        userstakes_table.erase(user_it);  // Remove if fully unstaked
    } else {
        userstakes_table.modify(user_it, get_self(), [&](auto& r) {
            r.amount -= quantity;
            r.last_update = time_point_sec(current_time_point());
        });
    }

    // 3. IMMEDIATELY reduce dApp's total stake and credits
    auto it = acct_table.require_find(dapp.value, "no dapp stake found");
    _refill(it);  // Refill credits first based on current stake using adaptive algorithm
    acct_table.modify(it, same_payer, [&](auto& r) {
        r.stake -= quantity;  // Reduce total stake immediately
    });

    // 4. Create or update unstake request (tokens locked for maturity period)
    unstake_table_type unstake_table(get_self(), dapp.value);
    auto unstake_it = unstake_table.find(user.value);

    if (unstake_it == unstake_table.end()) {
        // NEW UNSTAKE REQUEST: Start timer
        unstake_table.emplace(get_self(), [&](auto& r) {
            r.user = user;
            r.amount = quantity;
            r.request_time = time_point_sec(current_time_point());
        });
    } else {
        // EXISTING UNSTAKE REQUEST: Accumulate amount and RESET timer
        unstake_table.modify(unstake_it, get_self(), [&](auto& r) {
            r.amount += quantity;
            r.request_time = time_point_sec(current_time_point());  // ⚠️ TIMER RESET
        });
    }
}
```

**Critical Design Decision: Timer Reset**

When a user has an existing unstake request and makes another unstake request before claiming:
- The amounts **accumulate** (total unstake amount increases)
- The timer **resets** to the current time (new maturity period starts)

**Example:**
1. User unstakes 10 WAX at T₀ → 48-hour timer starts
2. User unstakes 5 WAX at T₀ + 40 hours (before claiming)
   - Total unstake amount: 15 WAX
   - Timer resets to T₀ + 40 hours
   - User must wait 48 hours from T₀ + 40 hours (not from T₀)

**Rationale:**
- Ensures all accumulated unstake amounts are subject to full maturity period
- Simplifies implementation (single unstake entry per user per dApp)

**Best Practice:** Unstake your full desired amount in a single transaction

### Step 2: Claim Funds

```cpp
void claimfund(const eosio::name& user, const eosio::name& dapp) {
    require_auth(user);

    // 1. Get unstake request
    unstake_table_type unstake_table(get_self(), dapp.value);
    auto unstake_it = unstake_table.require_find(user.value, "no unstake request found for this dapp");

    // 2. Check maturity period has passed
    uint64_t unstake_time = get_config(unstake_time_index, 172800); // default 48 hours
    uint64_t time_since_request = current_time_point().sec_since_epoch() - unstake_it->request_time.sec_since_epoch();
    check(time_since_request >= unstake_time, "unstake time not reached, please wait");

    // 3. Get full accumulated amount
    eosio::asset claim_amount = unstake_it->amount;

    // 4. Remove unstake request
    unstake_table.erase(unstake_it);

    // 5. Transfer tokens back to user
    action{{get_self(), "active"_n},
            "eosio.token"_n,
            "transfer"_n,
            std::make_tuple(get_self(), user, claim_amount, string("claim unstaked from " + dapp.to_string()))}
        .send();
}
```

## Important Invariants

The following invariants must be maintained for correct operation:

1. **Stake Consistency**: Total stake in `acctstate` **must equal** sum of all user stakes in `userstakes` for that dApp
2. **Global Stake**: Total stake in `stakestats` singleton **must equal** sum of all stakes in `acctstate` across all dApps
3. **EMA Updates**: EMA only updates when `dt >= ema_min_update_sec` to prevent excessive computation
4. **Free vs Paid Tracking**: Free calls (using credits) do NOT increment `paid_count_window` or affect paid rate EMA
5. **One Unstake per User**: Only one unstake request per user per dApp (amounts accumulate, timer resets)

**Maintenance**: Run `accumstake` after significant stake changes to maintain invariant #2.

## Security Considerations

### Immediate Stake Reduction
Stakes and credits are reduced **immediately** on unstake request (not on claim):
- Prevents users from using credits after initiating unstake
- Prevents double-spending of staked tokens
- Ensures fair credit allocation

### Time Lock Protection
- Default 72-hour (259200 seconds) maturity period
- Configurable via `unstaketime` config
- Timer reset on multiple unstake requests prevents bypass

## Usage Examples

### Stake for a dApp
```bash
# User stakes for a dApp
cleos transfer user1 orng.wax "100.00000000 WAX" "stake-mydapp"

# Sponsor stakes for a dApp
cleos transfer sponsor orng.wax "500.00000000 WAX" "stake-mydapp"

# dApp stakes for itself
cleos transfer mydapp orng.wax "200.00000000 WAX" "stake-mydapp"
```

### Unstake and Claim
```bash
# Step 1: Request unstake
cleos push action orng.wax unstakeuser '["user1", "mydapp", "50.00000000 WAX"]' -p user1

# Wait 48 hours...

# Step 2: Claim funds
cleos push action orng.wax claimfund '["user1", "mydapp"]' -p user1
```

### Check Stakes
```bash
# View individual stakes for a dApp
cleos get table orng.wax mydapp userstakes

# View pending unstake requests
cleos get table orng.wax mydapp unstake

# View total dApp stake and credits
cleos get table orng.wax orng.wax acctstate --lower mydapp --upper mydapp
```

### Check Adaptive Stats
```bash
# View adaptive configuration
cleos get table orng.wax orng.wax adaptcfg

# View real-time paid rate EMA
cleos get table orng.wax orng.wax rngstats

# View total stake across all dApps
cleos get table orng.wax orng.wax stakestats
```

## Configuration

### Basic Configuration (via `setconfig` and `configv2`)

| Config Name | Default Value | Description |
|-------------|--------------|-------------|
| `unstaketime` | 259200 (72 hours) | Maturity period in seconds before funds can be claimed |
| `feepercall` | 0.005 WAX | Cost per paid call when credits exhausted |
| `strikesmax` | 3 | Maximum strikes before oracle suspension |

### Adaptive Rate Limiting Configuration (via `configadptive`)

| Parameter | Default Value | Description |
|-----------|--------------|-------------|
| `adaptive_stake_enabled` | true | Enable/disable adaptive staking system |
| `total_capacity_calls_per_hr` | 18000 | Maximum system capacity (calls/hour) |
| `free_min_calls_per_hr` | 900 | Guaranteed minimum free capacity (calls/hour) |
| `headroom_calls_per_hr` | 1800 | Reserved buffer for paid calls (calls/hour) |
| `per_dapp_min_calls_per_hr` | 10 | Minimum per dApp rate (scaled by 100) |
| `burst_window_hours` | 100 | Burst window duration (scaled by 100 = 1.0 hour) |
| `ema_half_life_sec` | 900 | EMA half-life in seconds (15 minutes) |
| `ema_min_update_sec` | 10 | Minimum interval between EMA updates |

## Migration Notes

**From v1 to v2:**
- Old memo format: `"stake"` or `"deposit"`
- New memo format: `"stake-<dapp_name>"` or `"deposit-<dapp_name>"`
- Allows third-party staking (not possible in v1)
- Individual stake tracking (not tracked in v1)

**From v2 to v3.0:**
- **Adaptive rate limiting**: Credit refill now uses dynamic allocation based on paid demand
- **New singleton tables**: `adaptcfg`, `rngstats`, `stakestats` added for adaptive system
- **accumstake action**: New action to recalculate total stake across all dApps
- **configadptive action**: New action to configure adaptive rate limiting parameters
- **EMA tracking**: System now tracks paid call rate using Exponential Moving Average
- **Proportional allocation**: Credits allocated proportionally based on stake share
- **Backwards compatible**: Existing staked dApps continue to work, credits refill using new adaptive algorithm
