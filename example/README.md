# Dice Game Example - WAX ORNG Integration

This is a complete example dApp demonstrating how to integrate with the WAX ORNG v2.0 random number generation service. The contract implements a simple dice rolling game with player statistics tracking.

## Overview

The dice game contract showcases:
- ✅ **Proper ORNG Integration**: Uses `requestrand` and `receiverand` pattern
- ✅ **Request Coordination**: Uses `assoc_id` to match requests with responses  
- ✅ **Unique Seed Generation**: Combines timestamp + roll_id for uniqueness
- ✅ **State Management**: Tracks pending rolls and player statistics
- ✅ **Error Handling**: Validates requests and manages state transitions

## Contract Features

### Actions

| Action | Description | Authorization |
|--------|-------------|---------------|
| `init` | Initialize player account | Player |
| `rolldie` | Request a die roll (1-6) | Player |
| `receiverand` | Receive random value from orng.wax | orng.wax |
| `getstats` | Display player statistics | Any |
| `reset` | Clear all data (testing only) | Contract |

### Tables

| Table | Purpose | Key |
|-------|---------|-----|
| `dierolls` | Track pending rolls awaiting randomness | roll_id |
| `playerstats` | Player statistics and roll history | player |
| `rollhistory` | Complete roll history | id |

## Building the Contract

### Requirements
- EOSIO CDT v4.0.1+ installed
- Make

### Build Process

```bash
# Build the contract
make build

# Clean build artifacts
make clean

# View build info
make info
```

### Build Output

```
build/
├── dicegame.wasm    # Compiled WebAssembly contract
└── dicegame.abi     # Application Binary Interface
```

## Usage Example

### 1. Deploy Contract

```bash
# Testnet deployment
make deploy-testnet

# Mainnet deployment (adjust account)
make deploy-mainnet
```

### 2. Fund ORNG Usage

Before using the dice game, you need to fund the contract for ORNG calls:

```bash
# Option A: Stake WAX for free tier (recommended)
cleos transfer dicegame orng.wax "100.00000000 WAX" "stake"
# This provides 300 free calls per hour

# Option B: Deposit WAX for pay-per-use
cleos transfer dicegame orng.wax "10.00000000 WAX" "deposit"
# This provides 200 paid calls at 0.05 WAX each
```

### 3. Play the Game

```bash
# Initialize a player
cleos push action dicegame init '["alice"]' -p alice

# Roll the die
cleos push action dicegame rolldie '["alice"]' -p alice

# View player stats
cleos push action dicegame getstats '["alice"]' -p any
```

### 4. Monitor Results

```bash
# Check pending rolls
cleos get table dicegame dicegame dierolls

# Check player statistics  
cleos get table dicegame dicegame playerstats

# Check roll history
cleos get table dicegame dicegame rollhistory
```

## Code Walkthrough

### Key Integration Points

#### 1. Requesting Randomness

```cpp
void dicegame::rolldie(name player) {
    // Generate unique roll_id
    uint64_t roll_id = rolls.available_primary_key();
    
    // Store pending roll state
    rolls.emplace(player, [&](auto& r) {
        r.roll_id = roll_id;
        r.player = player;
        r.timestamp = current_time_point();
    });
    
    // Create unique seed from transaction hash
    auto tx_hash = _get_transaction_hash();
    uint64_t seed = _hash_to_int(tx_hash);
    
    // Request random number
    action{
        permission_level{get_self(), "active"_n},
        "orng.wax"_n, "requestrand"_n,
        std::make_tuple(roll_id, seed, get_self())
    }.send();
}
```

#### 2. Receiving Random Results

```cpp
void dicegame::receiverand(uint64_t assoc_id, const checksum256& random_value) {
    require_auth("orng.wax"_n);
    
    // Find pending roll using assoc_id
    auto roll_it = rolls.find(assoc_id);
    check(roll_it != rolls.end(), "Roll not found");
    
    // Extract randomness
    uint64_t rand_num = _hash_to_int(random_value);
    
    // Generate die result (1-6)
    uint32_t die_result = (rand_num % 6) + 1;
    
    // Process result and cleanup
    handle_die_result(roll_it->player, roll_it->roll_id, die_result);
    rolls.erase(roll_it);
}
```

### Best Practices Demonstrated

1. **State Coordination**: Uses `assoc_id` to match async requests/responses
2. **Unique Seeds**: Uses transaction hash for guaranteed uniqueness
3. **Error Handling**: Validates all state transitions
4. **Resource Management**: Cleans up completed requests
5. **Authorization**: Properly restricts action access

## Testing Scenarios

### Basic Flow Test

```bash
# 1. Initialize player
cleos push action dicegame init '["testuser"]' -p testuser

# 2. Roll die multiple times
cleos push action dicegame rolldie '["testuser"]' -p testuser
cleos push action dicegame rolldie '["testuser"]' -p testuser
cleos push action dicegame rolldie '["testuser"]' -p testuser

# 3. Check distribution
cleos push action dicegame getstats '["testuser"]' -p testuser
```

### Error Scenarios

```bash
# Try to roll for non-existent player (should auto-initialize)
cleos push action dicegame rolldie '["newplayer"]' -p newplayer

# Try to access stats for invalid player
cleos push action dicegame getstats '["nonexistent"]' -p any
```

## Troubleshooting

### Common Issues

1. **"Roll not found" Error**
   - Check that ORNG contract is responding
   - Verify your contract has sufficient WAX staked/deposited

2. **Build Errors**
   - Ensure EOSIO CDT is properly installed
   - Check that include paths are correct

3. **No Random Response**
   - Verify ORNG contract has funding for your account
   - Check that oracles are active and responding

### Debug Commands

```bash
# Check ORNG account state
cleos get table orng.wax orng.wax acctstate --key-type name --lower dicegame --upper dicegame

# Check pending ORNG requests
cleos get table orng.wax orng.wax reqs

# Check oracle status
cleos get table orng.wax orng.wax oracles.a
```

## Integration Notes

This example demonstrates the complete pattern for integrating any dApp with WAX ORNG v2.0:

1. **Fund Usage**: Stake or deposit WAX tokens with orng.wax
2. **Request Pattern**: Use unique assoc_id and seeds in `requestrand`
3. **Response Pattern**: Implement `receiverand` with proper validation
4. **State Management**: Track pending requests and clean up completed ones

The same patterns can be adapted for any game or application requiring secure randomness on WAX blockchain.

## License

[MIT](../LICENSE) - Same as parent WAX ORNG project.