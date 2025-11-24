# WAX ORNG v3.2: Decentralized Random Number Generation Service

WAX ORNG is the **official blockchain-native randomness service** for WAX dApp developers, providing secure, unpredictable 256-bit random values through a decentralized oracle network. Based on the [Signidice algorithm](https://github.com/gluk256/misc/blob/master/rng4ethereum/signidice.md) with RSA threshold signatures, it ensures provably fair randomness that cannot be manipulated or predicted.

## What's New in v3.x

The v3.x series represents a complete architectural upgrade from a centralized oracle to a **truly decentralized system**:

- **🔐 Decentralized Key Management**: Private key split using Shamir Secret Sharing across multiple oracles (M-of-N threshold)
- **💰 Adaptive CPU-Style Throttling**: Token bucket system with dynamic rate allocation based on stake proportion and network demand (EMA-tracked)
- **⚖️ Built-in Accountability**: Automatic oracle strike system with suspension for bad behavior
- **🎛️ Transparent Governance**: Block Producer multisig control over oracle selection and parameters
- **🔒 Secure Notification Delivery**: Introduce standard Antelope notification pattern `require_recipient`
- **🔄 Backwards Compatible**: Existing dApps continue working indefinitely without any code changes

## Quick Start for dApp Developers

### 1. Smart Contract Integration

Your contract needs a **notification handler** to receive random values. This uses the `require_recipient` pattern:

```cpp
#include <eosio/eosio.hpp>
#include <eosio/crypto.hpp>
#include <eosio/transaction.hpp>

class [[eosio::contract]] mygame : public eosio::contract {
public:
    using contract::contract;

    // Table to track pending die rolls
    struct [[eosio::table]] dieroll {
        uint64_t roll_id;
        eosio::name player;
        eosio::time_point_sec timestamp;

        uint64_t primary_key() const { return roll_id; }
        uint64_t by_player() const { return player.value; }
    };
    using dierolls_table = eosio::multi_index<"dierolls"_n, dieroll,
        eosio::indexed_by<"byplayer"_n, eosio::const_mem_fun<dieroll, uint64_t, &dieroll::by_player>>>;

    // Your action that needs randomness
    [[eosio::action]]
    void rolldie(eosio::name player) {
        require_auth(player);

        // Generate unique roll_id for coordination
        dierolls_table rolls(get_self(), get_self().value);
        uint64_t roll_id = rolls.available_primary_key();

        // Store pending roll
        rolls.emplace(player, [&](auto& r) {
            r.roll_id = roll_id;
            r.player = player;
            r.timestamp = eosio::current_time_point();
        });

        // Use transaction hash as seed for guaranteed uniqueness
        auto tx_hash = _get_transaction_hash();
        uint64_t seed = _hash_to_int(tx_hash);

        // Request random number with roll_id as assoc_id
        eosio::action{
            eosio::permission_level{get_self(), "active"_n},
            "orng.wax"_n, "requestrand"_n,
            std::make_tuple(roll_id, seed, get_self())
        }.send();
    }

    // Notification handler to receive the random value
    [[eosio::on_notify("orng.wax::randnotify")]]
    void on_random(uint64_t request_id, eosio::name dapp,
                   uint64_t assoc_id, const eosio::checksum256& random_value) {
        // Verify this notification is for this contract
        eosio::check(dapp == get_self(), "notification is for different contract");

        // Find the pending roll using assoc_id (roll_id)
        dierolls_table rolls(get_self(), get_self().value);
        auto roll_it = rolls.find(assoc_id);
        eosio::check(roll_it != rolls.end(), "Roll not found");

        // Extract random bytes and use them
        uint64_t rand_num = _hash_to_int(random_value);

        // Roll die (1-6)
        uint32_t die_result = (rand_num % 6) + 1;

        // Process the result
        handle_die_result(roll_it->player, roll_it->roll_id, die_result);

        // Clean up completed roll
        rolls.erase(roll_it);
    }

private:
    void handle_die_result(eosio::name player, uint64_t roll_id, uint32_t result) {
        // Your game logic here - now you have the player, roll_id, and result
        // Example: Update player stats, award prizes, etc.
    }

    static eosio::checksum256 _get_transaction_hash() {
        size_t size = eosio::transaction_size();
        char buf[size];
        uint32_t read = eosio::read_transaction(buf, size);
        eosio::check(size == read, "read_transaction() has failed.");
        return eosio::sha256(buf, read);
    }

    static uint64_t _hash_to_int(const eosio::checksum256& hash) {
        auto hash_bytes = hash.extract_as_byte_array();
        uint64_t result = 0;
        for(int i = 0; i < 8; i++) {
            result = (result << 8) | hash_bytes[i];
        }
        return result;
    }
};
```

### 2. Request Random Numbers

Call `requestrand` with three parameters:

```cpp
// Generate unique seed from transaction hash
auto tx_hash = _get_transaction_hash();
uint64_t seed = _hash_to_int(tx_hash);

// requestrand(assoc_id, signing_value, caller)
action{
    permission_level{get_self(), "active"_n},
    "orng.wax"_n, "requestrand"_n,
    std::make_tuple(
        unique_request_id,   // assoc_id: your unique identifier to match request/response
        seed,                // signing_value: transaction hash ensures uniqueness
        get_self()           // caller: your contract name (must have notification handler)
    )
}.send();
```

### 3. Register for Notification Delivery (New dApps Only)

**Important**: If you're deploying a **new dApp during the collection phase**, you must register for notification delivery:

```bash
# Call this once after deploying your contract
cleos push action orng.wax skiplegacy '["mycontract"]' -p mycontract
```

**Why is this needed?**

During the initial collection phase (first 30-60 days after v3.0 deployment), WAX ORNG automatically captures existing dApps into a legacy compatibility list. New dApps deploying during this period need to explicitly opt into the notification pattern by calling `skiplegacy`.

**When to call skiplegacy:**
- ✅ You're deploying a **new dApp** with the notification handler (shown above)
- ✅ During the **collection phase** (check with WAX team if collection is active)
- ✅ **Before or after** your first `requestrand` call

**When NOT needed:**
- ❌ Collection phase has ended (all new dApps automatically use notifications)
- ❌ You're a legacy dApp already using the old `receiverand` pattern (you're automatically supported)

**Collection Phase Timeline:**

The collection phase runs for a limited time after v3.0 deployment to build a compatibility list of existing dApps. Check the current phase status:

```bash
# Check collection status
cleos get table orng.wax orng.wax config.a --key-type name --lower collecten --upper collecten
```

After collection ends, all new dApps automatically use the notification pattern without needing `skiplegacy`.

### 4. Fund Your Usage

#### **Free Tier (Recommended)** - CPU-Style Token Bucket

Stake WAX tokens to earn credits for a specific dApp with adaptive rate allocation:

```bash
# Stake via transfer - use memo format: stake-<dapp_name>
cleos transfer youraccount orng.wax "1000.00000000 WAX" "stake-mycontract"
```

- **Flexible Staking**: **Any account can stake for any dApp** - sponsors, users, or the dApp itself
- **Individual Tracking**: Each staker's contribution is tracked separately in the `userstakes` table
- **Adaptive Rate Allocation**: Your dApp's free call rate adjusts dynamically based on:
  - **Total system capacity** (default: 18,000 calls/hour)
  - **Your stake proportion** relative to all stakes
  - **Paid demand** (EMA-tracked) - as paid usage increases, free capacity adjusts
  - **Guaranteed minimum** (default: 10 calls/hour per dApp)
- **Token Bucket Model**: Credits accumulate over time up to a **burst capacity** (default: 1 hour of your rate)
- **Continuous Refill**: Credits replenish proportionally every second based on your allocated rate
- **Unstaking**: 72-hour (configurable) maturity period before funds can be claimed

#### **Pay-Per-Use**

Deposit WAX for immediate usage by a specific dApp:

```bash
# Deposit via transfer - use memo format: deposit-<dapp_name>
cleos transfer youraccount orng.wax "10.00000000 WAX" "deposit-mycontract"
```

- **Rate**: 0.01 WAX per call when free credits exhausted
- **Immediate**: No waiting, instant usage
- **Flexible**: Mix of free and paid calls based on demand

## Economic Model

### Pricing Structure
_Prices are subject to change as economics are tuned_

The WAX ORNG uses an **adaptive CPU-style token bucket system** where free capacity dynamically adjusts based on network conditions and paid demand.

| Usage Tier | Cost | Allocation | Best For |
|------------|------|------------|----------|
| **Free (Staked)** | Stake WAX | Adaptive rate based on your stake proportion + burst capacity | Consistent baseline throughput |
| **Paid** | 0.01 WAX/call | Unlimited when credits exhausted | Burst traffic, promotions |

### How Adaptive Rate Allocation Works

**Formula**: Your dApp's free call rate is calculated as:

```
T_free = max(free_min, total_capacity - headroom - paid_ema)
rate_dapp = max(per_dapp_min, T_free × (your_stake / total_stake))
burst_capacity = rate_dapp × burst_window (default: 1 hour)
```

**Default Parameters** (subject to tuning):
- `total_capacity`: 18,000 calls/hour (system-wide)
- `free_min`: 900 calls/hour (guaranteed minimum free capacity)
- `headroom`: 1,800 calls/hour (reserved for paid bursts)
- `per_dapp_min`: 10 calls/hour (guaranteed per dApp)
- `burst_window`: 1.0 hours (full refill time)
- `ema_half_life`: 15 minutes (paid demand tracking)

**What This Means**:
- If you have **10% of total stake**, you get roughly **10% of free capacity**
- As **paid demand increases** (tracked via EMA), free capacity shrinks but never below `free_min`
- You can **burst** up to your full hour's allocation, then refill continuously
- Even with **zero stake**, you get `per_dapp_min` calls/hour

### Example Scenarios

**Scenario 1: Light paid demand, 1000 WAX staked (1% of 100K total stake)**
```
T_free = max(900, 18000 - 1800 - 100) = 16,100 calls/hr
Your rate = max(10, 16100 × 0.01) = 161 calls/hr
Burst capacity = 161 calls (can use all 161 immediately, then refill over next hour)
Cost: 1000 WAX stake (one-time, recoverable)
```

**Scenario 2: Heavy paid demand (10K calls/hr paid EMA), same 1% stake**
```
T_free = max(900, 18000 - 1800 - 10000) = 6,200 calls/hr
Your rate = max(10, 6200 × 0.01) = 62 calls/hr
Burst capacity = 62 calls
Cost: Same 1000 WAX stake
```

**Scenario 3: No stake, using minimum**
```
Your rate = 10 calls/hr (guaranteed minimum)
Burst capacity = 10 calls
Cost: 0 WAX stake, but very limited throughput
```

_Note: Combining stake (for baseline) and deposits (for bursts) provides optimal flexibility_

### Staking & Unstaking Rules

#### **How Adaptive Staking Works**

1. **Anyone Can Stake for Any dApp**
   - Users, sponsors, guilds, or the dApp itself can contribute stakes
   - Use the memo format: `stake-<dapp_name>`
   - Individual contributions are tracked in the `userstakes` table (scoped by dApp)
   - Total dApp stake is tracked in the `acctstate` table

2. **Credits Are Allocated Dynamically**
   - All stakes for a dApp contribute to that dApp's free credit pool
   - **Rate adapts** based on your proportion of total stake and system-wide paid demand
   - Credits **refill continuously** (every second) based on allocated rate
   - Credits are **capped at burst capacity** (rate × burst_window)
   - The dApp uses credits regardless of who staked them

3. **Token Bucket Behavior**
   - Initial credits: Equal to your burst capacity
   - Refill rate: Calculated adaptively per second
   - Maximum credits: Your current burst capacity (adjusts as stake changes)
   - Consumption: 1 credit per random number request
   - Fallback: When credits exhausted, automatically deducts from deposited balance (paid tier)

#### **Unstaking Process** (Two-Step with Time Lock)

**Step 1: Request Unstake**
```bash
# User requests to unstake their contribution
cleos push action orng.wax unstakeuser '["youraccount", "mycontract", "50.00000000 WAX"]' -p youraccount
```

- Your stake is **immediately reduced** in the `userstakes` table
- The dApp's total stake and credits are **immediately reduced** in `acctstate`
- An unstake request is created in the `unstake` table with a timestamp
- Tokens remain locked in the contract for the maturity period (default: 48 hours)

**Step 2: Claim After Maturity**
```bash
# After 72 hours (or configured time), claim your tokens
cleos push action orng.wax claimfund '["youraccount", "mycontract"]' -p youraccount
```

- Tokens are transferred back to your account
- The unstake request is removed from the `unstake` table

#### **⚠️ Important: Timer Reset Behavior**

If you make **multiple unstake requests before claiming**:

1. **First unstake**: Request 10 WAX at time T₀ → 72-hour timer starts
2. **Second unstake** (before claiming): Request 5 WAX at time T₀ + 40 hours
   - The amounts **accumulate** (now 15 WAX total)
   - The timer **resets** to T₀ + 40 hours (new 72-hour period starts)
   - You must now wait 72 hours from the **latest unstake request**

#### **Check Your Stakes and Balance**

```bash
# View your individual stakes for a specific dApp
cleos get table orng.wax <dapp_name> userstakes --key-type name --index 1 --lower youraccount --upper youraccount

# View pending unstake requests
cleos get table orng.wax <dapp_name> unstake --key-type name --index 1 --lower youraccount --upper youraccount

# View total dApp stake and credits
cleos get table orng.wax orng.wax acctstate --key-type name --index 1 --lower <dapp_name> --upper <dapp_name>
```

## Migration from v1.x

### Code Changes: **NONE REQUIRED** ✅

**For Existing dApps**: Your current `requestrand` and `receiverand` implementations continue working **indefinitely**. You do **NOT** need to upgrade unless you choose to.

**How Backwards Compatibility Works**:

During the collection phase (first 30-60 days after v3.0 deployment), WAX ORNG automatically captures all existing dApps that call `requestrand`. These dApps are added to a legacy compatibility list and will continue receiving random numbers via the familiar `receiverand` callback pattern.

**What This Means for You**:
- ✅ Your existing code works unchanged
- ✅ No action required - you're automatically protected
- ✅ Your contract code hash is recorded for security
- ✅ Random numbers continue being delivered to your `receiverand` action
- ✅ You can upgrade to the notification pattern whenever you're ready (optional, not required)

**If You Upgrade Your Contract**:

If you deploy a new version of your contract (code hash changes), the system automatically migrates you to the new notification delivery pattern. To prepare for this:

```cpp
// Add a notification handler (can coexist with receiverand)
[[eosio::on_notify("orng.wax::randnotify")]]
void on_random(uint64_t request_id, eosio::name dapp,
               uint64_t assoc_id, const eosio::checksum256& random_value) {
    eosio::check(dapp == get_self(), "wrong dapp");
    // Process random number (same logic as receiverand)
}
```

### Economic Changes: **ACTION REQUIRED** ⚠️

**Before v3.x**: Unlimited free calls (subject to rate limiting)
**After v3.x**: Must stake WAX or pay per call with adaptive rate allocation

#### Migration Steps:

1. **Estimate Usage**: Calculate your daily/hourly call volume
2. **Choose Strategy**:
   - For consistent usage → Stake WAX for free tier
   - For burst patterns → Deposit WAX for pay-per-use
   - For mixed usage → Combine both approaches

3. **Fund Your Account** (Note: memo format has changed):
   ```bash
   # For free tier (recommended for most dApps) - NEW FORMAT with dapp name
   cleos transfer mydapp orng.wax "1000.00000000 WAX" "stake-mydapp"

   # For pay-per-use - NEW FORMAT with dapp name
   cleos transfer mydapp orng.wax "50.00000000 WAX" "deposit-mydapp"

   # Anyone can also stake/deposit for your dApp
   cleos transfer sponsor orng.wax "1000.00000000 WAX" "stake-mydapp"
   ```

4. **Monitor Usage**: Check your credit balance and fees in contract tables

### Optional: Migrating to Notification Pattern

Want to adopt the new secure notification pattern? Add a notification handler to your contract:

```cpp
[[eosio::on_notify("orng.wax::randnotify")]]
void on_random(uint64_t request_id, eosio::name dapp,
               uint64_t assoc_id, const eosio::checksum256& random_value) {
    // Verify this notification is for your contract
    eosio::check(dapp == get_self(), "wrong dapp");

    // Process random number (same as your receiverand logic)
    handle_random_result(assoc_id, random_value);
}
```

**Benefits of Notification Pattern**:
- ✅ More secure
- ✅ Modern EOSIO best practice
- ✅ Recommended for all new contract deployments

## Advanced Features

### Error Handling & Recovery

If random number delivery fails, the oracle will call `markfailed` to store the result for later retrieval. You can then retrieve and retry delivery:

1. **Check for failed deliveries**:
   ```bash
   # View all undelivered results (includes error messages from oracle)
   cleos get table orng.wax orng.wax undelivered

   # Filter by your dApp using secondary index
   cleos get table orng.wax orng.wax undelivered --index 2 --key-type i128 --lower <YOUR_DAPP_NAME_AS_HEX>
   ```

2. **Retrieve and retry failed result**:
   ```bash
   # Get undelivered random value by assoc_id (will retry delivery to your handler)
   cleos push action orng.wax getresult '["mydapp", 12345]' -p mydapp

   # The undelivered table entry includes:
   # - request_id: internal request ID
   # - dapp: your contract name
   # - assoc_id: your original assoc_id from requestrand
   # - rnd: the random value (checksum256)
   # - error_message: the error that occurred during delivery
   # - oracle_reward_deadline: deadline for oracle to claim remaining reward
   ```

3. **Manual retry by request_id** (alternative):
   ```bash
   # Anyone can retry delivery if they know the request_id
   cleos push action orng.wax retrydeliver '[12345]' -p anypermission
   ```

```

## Building and Testing

### Requirements
- Docker (configured to run without sudo)
- Node.js and npm
- Make

### Build Process

```bash
# Install dependencies
npm install

# Build smart contract (requires Docker)
make docker-build

# Run comprehensive tests
npm test

# Format code
npm run prettier

# Clean build artifacts
make clean
```

### Local Development

```bash
# Start development container
make dev-docker-start

# Build inside container
make docker-build

# Run single test file
npm test -- --testNamePattern="specific test"
```

## Deployment Networks

### Testnet
```bash
make deploy-testnet
# Uses: https://testnet.wax.pink.gg
```

### Mainnet
```bash
make deploy-mainnet  
# Uses: https://wax.greymass.com
# Requires: orng.wax@deploy permission
```

## Security & Trust

### Cryptographic Guarantees
- **Threshold RSA**: 4096-bit keys with M-of-N signing (typically 2-of-3)
- **Unpredictability**: As long as M oracles remain honest, results cannot be biased
- **Uniqueness**: RSA signatures prevent multiple valid results for same input
- **Verifiability**: All signatures verified on-chain before delivery

### Decentralization Benefits
- **No Single Point of Failure**: Key split across multiple independent oracles
- **Economic Incentives**: Oracles earn fees for honest behavior, lose income for misbehavior
- **Transparent Governance**: Block Producer multisig controls oracle selection
- **Automatic Accountability**: Strike system with suspension for bad signatures

### Oracle Requirements
- High-availability infrastructure (>99.9% uptime)
- Secure key management and signing systems
- Regular security audits and monitoring
- Geographic and organizational diversity

## Oracle Economics

Oracle operators earn compensation through two separate revenue streams:

### 1. Fixed Monthly Stipend (USD-Denominated)

- **Amount**: Configured by governance (e.g., $1,000/month per oracle)
- **Accrual**: Continuous, accumulates every second the oracle is active
- **Currency**: Denominated in USD, converted to WAX at claim time using Delphioracle price feed
- **Funding**: Paid from the treasury pool (funded via deposits with memo "treasury")
- **Status**: Only accrues while oracle is active (suspended oracles stop accruing)

### 2. Per-Call Fee Bonus (Paid Requests Only)

- **Amount**: Per-request fee (e.g., 0.01 WAX)
- **Eligibility**: **Only paid for pay-per-use (deposit-funded) requests**, NOT stake-tier free calls
- **Distribution**: Split equally among all active (non-suspended) oracles
- **Funding**: Paid directly from dApp deposit balances (not from treasury)
- **Purpose**: Rewards oracles for processing high-demand paid traffic

### How to Claim Earnings

```bash
# Claim accumulated stipend + per-call fees
cleos push action orng.wax claim '["your.oracle"]' -p your.oracle

# Check your pending rewards
cleos get table orng.wax orng.wax balances --lower your.oracle --upper your.oracle  # Per-call fees
cleos get table orng.wax orng.wax ostip.a --lower your.oracle --upper your.oracle  # Stipend status
```

**Claim Throttling**: Minimum 24 hours between claims (configurable)

### Payment Priority

When claiming, payments are processed as:
1. **Per-call fees**: Paid in full from contract balance
2. **Stipend**: Limited by available treasury balance

If treasury is low, fee bonuses are always paid but stipend may be partial.

### Impact of Oracle Suspension

- **Stipend accrual**: Stops immediately upon suspension
- **Existing balances**: Remain claimable
- **Resume accrual**: Begins again when suspension is lifted via `resetsuspen`

## Monitoring & Analytics

### Check Account Status
```bash
# View your staking and credit balance
cleos get table orng.wax orng.wax acctstate --key-type name --index 1 --lower mydapp --upper mydapp

# View treasury and system status
cleos get table orng.wax orng.wax treasury
cleos get table orng.wax orng.wax config.a
```

### Oracle Performance
```bash
# Current oracle set
cleos get table orng.wax orng.wax oracles.a

# Public keys and versions
cleos get table orng.wax orng.wax pubkeys
```

## Support & Resources

- **Documentation**: [Technical Specification](docs/RNG-V2-doc.md)
- **Blog Post**: [WAX RNG Overview](https://medium.com/wax-io/how-the-wax-rng-native-blockchain-service-solves-common-problems-for-dapp-developers-28c414fa1ca9)
- **Contract**: `orng.wax` on WAX mainnet
- **Issues**: [GitHub Issues](https://github.com/worldwide-asset-exchange/wax-orng/issues)

## License

[MIT](LICENSE) - Open source and free to use for all WAX dApps.

---

**Ready to integrate fair randomness into your dApp?** Start with the Quick Start guide above, or check out the test contracts in `/tests/contracts/` for complete examples.
