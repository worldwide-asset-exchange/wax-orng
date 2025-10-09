# Registration Pattern: User-Pays-RAM Design

## Overview

The registration pattern is a security mechanism that prevents RAM exploitation attacks while ensuring fair cost allocation. Users must register before staking or depositing for a dApp, paying for their own table entries rather than having the contract bear the cost.

## The Problem: RAM Exploitation

### Original Design Vulnerability

In the initial implementation, the `_stake` and `_deposit` helper functions created table entries automatically during token transfers:

```cpp
// VULNERABLE: Contract pays RAM for new entries
void orng::_stake(const name& staker, const name& dapp, const asset& quantity) {
    auto it = acct_table.find(dapp.value);
    if (it == acct_table.end()) {
        acct_table.emplace(get_self(), [&](auto& r) {  // ⚠️ Contract pays RAM!
            r.dapp = dapp;
            r.stake = quantity;
            r.last_update = time_point_sec(current_time_point());
        });
    }

    userstakes_table_type userstakes_table(get_self(), dapp.value);
    auto user_it = userstakes_table.find(staker.value);
    if (user_it == userstakes_table.end()) {
        userstakes_table.emplace(get_self(), [&](auto& r) {  // ⚠️ Contract pays RAM!
            r.user = staker;
            r.amount = quantity;
        });
    }
}
```

### Attack Scenario

A malicious actor could exploit this by:

1. **Creating fake dApps**: Deploy hundreds of contracts with unique names
2. **Staking minimal amounts**: Send 0.00000001 WAX stakes for each fake dApp
3. **RAM drain**: Each stake creates:
   - 1 `acctstate` entry (~200 bytes)
   - 1 `userstakes` entry (~150 bytes)
   - **Total**: ~350 bytes per attack
4. **Cost to attacker**: 0.00000001 WAX + transaction costs
5. **Cost to contract**: ~350 bytes RAM (≈ 0.035 WAX) **per attack**

**Attack economics:**
- Attacker spends: 0.00000001 WAX
- Contract pays: 0.035 WAX in RAM
- **Profit ratio**: 3,500,000:1 exploitation

With 1,000 fake dApps and 1,000 attackers staking for each:
- Attacker cost: 1,000 * 0.00000001 = 0.00001 WAX
- Contract RAM cost: 1,000,000 * 350 bytes = 350 MB ≈ **35,000 WAX**

## The Solution: Registration Pattern

### Design Principles

1. **User Pays RAM**: Users pay for their own data storage
2. **Explicit Registration**: Separate action with clear authorization
3. **One-Time Setup**: Register once per user-dApp pair
4. **Protection**: Prevents contract from being RAM-drained

### Implementation

#### Step 1: Registration Action

```cpp
ACTION orng::reguser(const name& user, const name& dapp) {
    check(!is_paused(), "Contract is paused");
    require_auth(user);  // ✅ User authorizes and pays!
    check(is_account(dapp), "dapp account does not exist");

    // Create acctstate entry if needed - USER PAYS RAM
    auto it = acct_table.find(dapp.value);
    if (it == acct_table.end()) {
        acct_table.emplace(user, [&](auto& r) {  // ✅ user pays RAM!
            r.dapp = dapp;
            r.stake = asset{0, WAX};
            r.credits = 0;
            r.fee_balance = asset{0, WAX};
            r.last_nonce = 0;
            r.last_update = time_point_sec(current_time_point());
        });
    }

    // Create userstakes entry - USER PAYS RAM
    userstakes_table_type userstakes_table(get_self(), dapp.value);
    auto user_it = userstakes_table.find(user.value);
    check(user_it == userstakes_table.end(), "user already registered for this dapp");

    userstakes_table.emplace(user, [&](auto& r) {  // ✅ user pays RAM!
        r.user = user;
        r.amount = asset{0, WAX};
        r.last_update = time_point_sec(current_time_point());
    });
}
```

#### Step 2: Modified Stake/Deposit Functions

```cpp
void orng::_stake(const name& staker, const name& dapp, const asset& quantity) {
    // ONLY modify acctstate table - must exist already!
    auto it = acct_table.find(dapp.value);
    check(it != acct_table.end(), "dapp not registered - call reguser action first");

    _refill(it);
    acct_table.modify(it, same_payer, [&](auto&r){
        r.stake += quantity;
    });

    // ONLY modify userstakes table - must exist already!
    userstakes_table_type userstakes_table(get_self(), dapp.value);
    auto user_it = userstakes_table.find(staker.value);
    check(user_it != userstakes_table.end(),
          "user not registered for this dapp - call reguser action first");

    userstakes_table.modify(user_it, same_payer, [&](auto& r) {
        r.amount += quantity;
        r.last_update = time_point_sec(current_time_point());
    });
}
```

#### Step 3: Modified requestrand

```cpp
void orng::requestrand(uint64_t assoc_id, uint64_t signing_value, const name& caller) {
    // ... existing checks ...

    // Require registration - entry must exist already!
    auto it = acct_table.find(caller.value);
    check(it != acct_table.end(), "not registered - call reguser action first");

    // ... rest of function ...
}
```

## User Flow

### Before: Vulnerable Pattern

```bash
# Single step - contract pays RAM
cleos transfer user orng.wax "100.00000000 WAX" "stake-mydapp"
```

### After: Registration Pattern

```bash
# Step 1: Register (user pays ~300 bytes RAM = ~0.03 WAX)
cleos push action orng.wax reguser '["user", "mydapp"]' -p user

# Step 2: Stake (no additional RAM cost)
cleos transfer user orng.wax "100.00000000 WAX" "stake-mydapp"
```

## Security Benefits

### 1. RAM Cost Distribution

| Entity | Before | After |
|--------|--------|-------|
| Contract | Pays all RAM | Pays nothing |
| User | Pays nothing | Pays own RAM (~0.03 WAX) |
| Attacker ROI | 3,500,000:1 profit | 1:1 (no profit) |

### 2. Attack Prevention

**Before (vulnerable):**
- Attacker creates 1,000 fake dApps
- Stakes 0.00000001 WAX for each
- Contract pays 350 MB RAM = 35,000 WAX
- Attack cost: 0.01 WAX

**After (protected):**
- Attacker must register for each dApp
- Pays 0.03 WAX RAM per registration
- Attack cost: 1,000 * 0.03 = 30 WAX
- Contract RAM cost: 0 WAX
- **Attack becomes unprofitable**

### 3. Sybil Resistance

The registration requirement makes Sybil attacks expensive:
- Each fake identity must pay RAM
- No economies of scale for attackers
- Linear cost increase with attack size

### 4. Fair Resource Allocation

Users who benefit from the service pay for the resources they use:
- Storage cost proportional to usage
- No subsidization of attackers
- Sustainable economic model

## Implementation Details

### Table Structure

#### acctstate (scope: orng.wax)
```cpp
struct acctstate {
    name dapp;
    asset stake{0, WAX};
    uint32_t credits = 0;
    asset fee_balance{0, WAX};
    uint64_t last_nonce = 0;
    time_point_sec last_update;

    uint64_t primary_key() const { return dapp.value; }
};
```
**RAM per entry**: ~200 bytes

#### userstakes (scope: dapp)
```cpp
struct userstake {
    name user;
    asset amount{0, WAX};
    time_point_sec last_update;

    uint64_t primary_key() const { return user.value; }
};
```
**RAM per entry**: ~150 bytes

**Total registration cost**: ~350 bytes ≈ 0.035 WAX

### Error Messages

The implementation provides clear error messages to guide users:

```cpp
// When staking without registration
check(it != acct_table.end(), "dapp not registered - call reguser action first");

// When user not registered
check(user_it != userstakes_table.end(),
      "user not registered for this dapp - call reguser action first");

// When requesting randomness without registration
check(it != acct_table.end(), "not registered - call reguser action first");
```

## Migration Guide

### For dApp Developers

1. **Register your dApp**:
   ```bash
   cleos push action orng.wax reguser '["mydapp", "mydapp"]' -p mydapp
   ```

2. **Update documentation**: Inform users they must register before staking

3. **Update UI/scripts**: Add registration step to onboarding flow

### For Users

1. **Check if registered**:
   ```bash
   cleos get table orng.wax mydapp userstakes --lower user --upper user
   ```

2. **Register if needed**:
   ```bash
   cleos push action orng.wax reguser '["user", "mydapp"]' -p user
   ```

3. **Stake/deposit as normal**:
   ```bash
   cleos transfer user orng.wax "100.00000000 WAX" "stake-mydapp"
   ```

## Cost Analysis

### RAM Costs

| Action | Who Pays | Amount | Notes |
|--------|----------|--------|-------|
| reguser | User | ~350 bytes (~0.035 WAX) | One-time per user-dApp pair |
| stake transfer | Nobody | 0 | Modifies existing entry |
| deposit transfer | Nobody | 0 | Modifies existing entry |
| requestrand | Nobody | 0 | Uses existing entry |
| unstakeuser | Nobody | ~150 bytes (~0.015 WAX) | Creates unstake entry |

### Economic Comparison

**Scenario**: 1,000 users stake for a dApp

| Metric | Before | After |
|--------|--------|-------|
| Total RAM | 350 KB | 350 KB |
| Contract pays | 350 KB (35 WAX) | 0 WAX |
| Users pay | 0 WAX | 35 WAX total (0.035 each) |
| Attack cost | 0.01 WAX | 35 WAX |
| **Sustainable?** | ❌ No | ✅ Yes |

## Alternative Approaches Considered

### 1. Two-Step Stake/Deposit Pattern

**Design**: Use pending tables with separate claim actions

**Pros**:
- Separates notification context from direct actions
- Explicit user authorization for table creation

**Cons**:
- More complex UX (3 steps vs 2)
- Additional table overhead
- Temporary RAM cost to contract
- More complex code

**Decision**: Registration pattern is simpler and equally secure

### 2. Minimum Stake Requirement

**Design**: Require minimum stake (e.g., 10 WAX) to make attacks expensive

**Pros**:
- Simple implementation
- No code changes needed

**Cons**:
- Doesn't solve RAM payer problem
- Excludes small users
- Attackers can still profit at scale
- Doesn't address deposits

**Decision**: Not sufficient on its own

### 3. RAM Quota Per Account

**Design**: Limit RAM usage per account

**Pros**:
- Caps total damage
- Simple to implement

**Cons**:
- Contract still pays
- Doesn't prevent attack
- Complex quota management
- Unfair to legitimate users

**Decision**: Treats symptoms, not cause

## Testing

### Test Coverage

The implementation includes comprehensive tests:

1. **Registration flow**:
   - User can register for dApp
   - Cannot register twice
   - Invalid dApp name rejected

2. **Stake without registration**:
   - Transfer fails with clear error
   - Error message guides to reguser

3. **Deposit without registration**:
   - Transfer fails with clear error
   - Error message guides to reguser

4. **requestrand without registration**:
   - Request fails with clear error
   - Error message guides to reguser

5. **RAM payer verification**:
   - User pays for reguser entries
   - Contract pays nothing
   - Subsequent operations use same_payer

## Security Considerations

### 1. Registration Griefing

**Attack**: Register for someone else's dApp to pay their RAM

**Mitigation**: This is actually beneficial - anyone can pay RAM for a dApp they want to support

**Impact**: None (harmless)

### 2. Forgotten Registration

**Issue**: Users forget to register before staking

**Mitigation**:
- Clear error messages
- Documentation with registration steps
- UI integration guidance

**Impact**: Low (one-time UX friction)

### 3. Multiple Registrations

**Attack**: Try to register multiple times to waste RAM

**Mitigation**: `check(user_it == userstakes_table.end(), "user already registered")`

**Impact**: None (prevented)

## Conclusion

The registration pattern provides:

✅ **Security**: Eliminates RAM exploitation attacks
✅ **Fairness**: Users pay for their own data
✅ **Simplicity**: Clear two-step process
✅ **Sustainability**: No contract RAM subsidy
✅ **Economics**: Attacks become unprofitable

The minor UX friction of one-time registration is a worthwhile tradeoff for eliminating a critical vulnerability and ensuring long-term contract sustainability.
