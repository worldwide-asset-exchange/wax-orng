# WAX ORNG v3.0: Decentralized Random Number Generation Service

WAX ORNG is the **official blockchain-native randomness service** for WAX dApp developers, providing secure, unpredictable 256-bit random values through a decentralized oracle network. Based on the [Signidice algorithm](https://github.com/gluk256/misc/blob/master/rng4ethereum/signidice.md) with RSA threshold signatures, it ensures provably fair randomness that cannot be manipulated or predicted.

## What's New in v3.0

Version 3.0 represents a complete architectural upgrade from a centralized oracle to a **truly decentralized system**:

- **🔐 Decentralized Key Management**: Private key split using Shamir Secret Sharing across multiple oracles (M-of-N threshold)
- **💰 Economic Throttling**: Stake-based free tier + pay-per-use pricing model
- **⚖️ Built-in Accountability**: Automatic oracle strike system with suspension for bad behavior
- **🎛️ Transparent Governance**: Block Producer multisig control over oracle selection and parameters
- **🔄 Backwards Compatible**: Existing dApps continue working without code changes

## Quick Start for dApp Developers

### 1. Smart Contract Integration

Your contract needs a `receiverand` action to receive random values:

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
    
    // Callback to receive the random value
    [[eosio::action]]
    void receiverand(uint64_t assoc_id, const eosio::checksum256& random_value) {
        require_auth("orng.wax"_n);
        
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
        get_self()           // caller: your contract name (must have receiverand action)
    )
}.send();
```

### 3. Fund Your Usage

#### **Free Tier (Recommended)**

After registration, stake WAX tokens to earn credits for a specific dApp:

```bash
# Step 1: Stake via transfer - use memo format: stake-<dapp_name>
cleos transfer youraccount orng.wax "100.00000000 WAX" "stake-mycontract"
```

- **Flexible Staking**: **Any account can stake for any dApp** - sponsors, users, or the dApp itself
- **Individual Tracking**: Each staker's contribution is tracked separately in the `userstakes` table
- **Rate**: 3 free calls per WAX per hour per dApp
- **Refill**: Credits replenish automatically over time
- **Unstaking**: 48-hour (configurable) maturity period before funds can be claimed

#### **Pay-Per-Use**

After registration, deposit WAX for immediate usage by a specific dApp:

```bash
# Step 1: Deposit via transfer - use memo format: deposit-<dapp_name>
cleos transfer youraccount orng.wax "10.00000000 WAX" "deposit-mycontract"
```

- **Rate**: 0.05 WAX per call when free credits exhausted
- **Immediate**: No waiting, instant usage
- **Flexible**: Mix of free and paid calls based on demand

## Economic Model

### Pricing Structure

| Usage Tier | Cost | Rate Limit | Best For |
|------------|------|------------|----------|
| **Free (Staked)** | 1 WAX stake | 3 calls/hour | Casual games, testing |
| **Paid** | 0.05 WAX/call | No limit | High-frequency games, bursts |

### Cost Examples

```
Small Game (100 calls/day):
- Stake 34 WAX → Free forever
- OR Pay 5 WAX per day

Medium Game (1000 calls/day):
- Stake 334 WAX → Free forever  
- OR Pay 50 WAX per day

Large Game (10,000 calls/day):
- Stake 3,334 WAX → Free forever
- OR Pay 500 WAX per day
```

### Staking & Unstaking Rules

#### **How Staking Works**

1. **Anyone Can Stake for Any dApp**
   - Users, sponsors, guilds, or the dApp itself can contribute stakes
   - Use the memo format: `stake-<dapp_name>`
   - Individual contributions are tracked in the `userstakes` table (scoped by dApp)
   - Total dApp stake is tracked in the `acctstate` table

2. **Credits Are Allocated to the dApp**
   - All stakes for a dApp contribute to that dApp's free credit pool
   - Credits refill automatically: 3 calls per WAX per hour
   - The dApp uses credits regardless of who staked them

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
# After 48 hours (or configured time), claim your tokens
cleos push action orng.wax claimfund '["youraccount", "mycontract"]' -p youraccount
```

- Tokens are transferred back to your account
- The unstake request is removed from the `unstake` table

#### **⚠️ Important: Timer Reset Behavior**

If you make **multiple unstake requests before claiming**:

1. **First unstake**: Request 10 WAX at time T₀ → 48-hour timer starts
2. **Second unstake** (before claiming): Request 5 WAX at time T₀ + 40 hours
   - The amounts **accumulate** (now 15 WAX total)
   - The timer **resets** to T₀ + 40 hours (new 48-hour period starts)
   - You must now wait 48 hours from the **latest unstake request**

#### **Check Your Registration and Stakes**

```bash
# Check if user is registered for a dApp (look for entry in userstakes)
cleos get table orng.wax <dapp_name> userstakes --key-type name --index 1 --lower youraccount --upper youraccount

# View your individual stakes for a specific dApp
cleos get table orng.wax <dapp_name> userstakes --key-type name --index 1 --lower youraccount --upper youraccount

# View pending unstake requests
cleos get table orng.wax <dapp_name> unstake --key-type name --index 1 --lower youraccount --upper youraccount

# View total dApp stake and credits (also shows if dApp is registered)
cleos get table orng.wax orng.wax acctstate --key-type name --index 1 --lower <dapp_name> --upper <dapp_name>
```

## Migration from v1.x

### Code Changes: **NONE REQUIRED** ✅

Your existing `requestrand` and `receiverand` implementations work unchanged. The contract maintains full backwards compatibility.

### Economic Changes: **ACTION REQUIRED** ⚠️

**Before v3.0**: Unlimited free calls (subject to rate limiting)
**After v3.0**: Must stake WAX or pay per call

#### Migration Steps:

1. **Estimate Usage**: Calculate your daily/hourly call volume
2. **Choose Strategy**: 
   - For consistent usage → Stake WAX for free tier
   - For burst patterns → Deposit WAX for pay-per-use
   - For mixed usage → Combine both approaches

3. **Fund Your Account** (Note: memo format has changed):
   ```bash
   # For free tier (recommended for most dApps) - NEW FORMAT with dapp name
   cleos transfer mydapp orng.wax "334.00000000 WAX" "stake-mydapp"

   # For pay-per-use - NEW FORMAT with dapp name
   cleos transfer mydapp orng.wax "50.00000000 WAX" "deposit-mydapp"

   # Anyone can also stake/deposit for your dApp (after registering)
   cleos transfer sponsor orng.wax "100.00000000 WAX" "stake-mydapp"
   ```

4. **Monitor Usage**: Check your credit balance and fees in contract tables

### Transition Period

- **v1 Compatibility**: Old API continues working during transition
- **Gradual Migration**: Switch funding model at your own pace  
- **No Downtime**: Seamless upgrade with no service interruption

## Advanced Features

### Error Handling & Recovery

If a `receiverand` callback fails, the oracle will call `markfailed` to store the result for later retrieval. You can then retrieve and retry delivery:

1. **Check for failed deliveries**:
   ```bash
   # View all undelivered results (includes error messages from oracle)
   cleos get table orng.wax orng.wax undelivered

   # Filter by your dApp using secondary index
   cleos get table orng.wax orng.wax undelivered --index 2 --key-type i128 --lower <YOUR_DAPP_NAME_AS_HEX>
   ```

2. **Retrieve and retry failed result**:
   ```bash
   # Get undelivered random value by assoc_id (will retry delivery to receiverand)
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

### Bandwidth Management

For high-volume dApps, set up dedicated bandwidth payers:

```bash
# 1. Create bandwidth payer permission
cleos set account permission payer paybw \
  '{"threshold":1,"keys":[],"accounts":[{"permission":{"actor":"orng.wax","permission":"active"},"weight":1}]}' \
  -p payer

# 2. Allow bandwidth payment
cleos set action permission payer boost.wax noop paybw

# 3. Register bandwidth payer
cleos push action orng.wax setbwpayer '["mydapp", "payer"]' -p mydapp

# 4. Accept bandwidth payment
cleos push action orng.wax acceptbwpay '["mydapp", "payer", true]' -p payer
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
