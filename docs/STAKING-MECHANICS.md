# Staking Mechanics Documentation

## Overview

The WAX ORNG v2 staking system allows **any account to stake for any dApp**, enabling flexible funding models where users, sponsors, guilds, or the dApp itself can contribute to the dApp's free credit pool.

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
    uint64_t credits;          // Free call credits (3 per WAX per hour)
    eosio::asset fee_balance;  // Pay-per-use balance
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
        _refill(it);  // Refill credits before modifying stake
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
- Total stake in `acctstate` determines the dApp's credit refill rate
- Individual stakes are tracked in `userstakes` (scoped by dApp) for unstaking purposes

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
    _refill(it);  // Refill credits first based on current stake
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

## Security Considerations

### Immediate Stake Reduction
Stakes and credits are reduced **immediately** on unstake request (not on claim):
- Prevents users from using credits after initiating unstake
- Prevents double-spending of staked tokens
- Ensures fair credit allocation

### Time Lock Protection
- Default 48-hour (172800 seconds) maturity period
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

## Configuration

| Config Name | Default Value | Description |
|-------------|--------------|-------------|
| `unstaketime` | 172800 (48 hours) | Maturity period in seconds before funds can be claimed |
| `kcallsperwax` | 3 | Free calls per WAX per hour |
| `feepercall` | 0.05 WAX | Cost per call when credits exhausted |

## Migration Notes

**From v1 to v2:**
- Old memo format: `"stake"` or `"deposit"`
- New memo format: `"stake-<dapp_name>"` or `"deposit-<dapp_name>"`
- Allows third-party staking (not possible in v1)
- Individual stake tracking (not tracked in v1)
