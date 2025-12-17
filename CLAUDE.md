# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WAX ORNG is a blockchain-native random number generation service for the WAX blockchain. It implements an M-of-N threshold RSA signature scheme for decentralized randomness based on the Signidice algorithm. The current version (v3.1) represents a complete architectural upgrade from centralized to decentralized oracle infrastructure with adaptive CPU-style staking.

## Development Commands

### Build & Test
```bash
# Install dependencies
npm install

# Build the smart contract locally (requires EOSIO CDT)
make build

# Build the smart contract (requires Docker)
make docker-build

# Run tests
npm test

# Format JavaScript code
npm run prettier

# Clean build artifacts
make clean
```

### Testing
- **Framework**: Jest with 10-minute timeout (configured in `jest.config.js`) for blockchain operations
- **Main test file**: `tests/waxorng.test.js` - Comprehensive contract functionality tests
- **Adaptive staking tests**: `tests/adaptiveStaking.test.js` - Tests for adaptive rate limiting and EMA calculations
- **Test environment**: Simulated blockchain using qtest-js
- **RSA utilities**: `tests/rsaSigning.js` - Key generation and signature verification
- **Test contracts**: `tests/contracts/` and `tests/randreceiver/` - Example dApp implementations
- **Run specific test**: `npm test -- --testNamePattern="test name"`
- **Run specific file**: `npm test tests/adaptiveStaking.test.js`
- **Test contracts**: Example receiver contracts in `tests/randreceiver/` (v1, v2, v3)

### Docker Development
```bash
# Start development container
make dev-docker-start

# Build inside container
make docker-build

# Stop development container
make dev-docker-stop
```

## Architecture

### Smart Contract (C++)
- **Main contract**: `src/orng.cpp` with header `include/orng.hpp`
- **Framework**: EOSIO/WAX smart contract using CDT
- **Version**: 3.2.0 (adaptive CPU-style staking with EMA-based throttling)
- **Deployment**: Contract account is `orng.wax`

### Key Components
- **Threshold RSA**: M-of-N oracle signature scheme (typically 2-of-3) using Shamir secret sharing
- **Economic model**: Two-tier system:
  - **Free tier**: Anyone can stake WAX for a dApp using memo `stake-<dapp_name>` to earn 1 free call per 100 WAX staked per hour (refills automatically)
  - **Paid tier**: Anyone can deposit WAX for a dApp using memo `deposit-<dapp_name>` at 0.01 WAX per call when credits are exhausted
- **Flexible staking**: Any account (users, sponsors, guilds, or dApp itself) can stake for any dApp
- **Individual tracking**: Each staker's contribution tracked separately in `userstakes` table (scoped by dApp)
- **Two-step unstaking**: `unstakeuser` → 72hr maturity (configurable) → `claimfund` (timer resets on multiple unstake requests)
- **Oracle management**: Automatic strike-and-suspend system for bad signatures
- **Notification delivery**: Modern `require_recipient` pattern with legacy `receiverand` callback support
- **Backwards compatibility**: Existing dApps were automatically captured during the initial collection phase (ended December 3, 2025)

### Data Structures
- **Multi-index tables** for persistent storage:
  - `acctstate`: Total stake and credits per dApp (scope: orng.wax)
  - `userstakes`: Individual user stakes per dApp (scope: dApp account)
  - `unstake`: Pending unstake requests with maturity timer (scope: dApp account)
  - `reqs`: Pending random number requests
  - `oracles.a`: Oracle registration and strike tracking
  - `undelivered`: Failed delivery attempts with error messages and retry capability
  - `config.a`: System configuration
- **Singleton tables** for global state:
  - `adaptcfg`: Adaptive rate limiting configuration (total capacity, free minimum, headroom, EMA parameters)
  - `rngstats`: Real-time paid rate tracking (paid_rate_ema_ch, paid_count_window, last_ema_update)
  - `stakestats`: Total stake aggregation across all dApps
- **RSA signature verification** on-chain (4096-bit keys)
- **SHA-256 hashing** for message construction
- **State machine pattern** for request/response flow

### Version 3.x Features
- **Decentralized key management**: Private key split using Shamir Secret Sharing across multiple oracles
- **Economic throttling**: Stake-based free tier + pay-per-use pricing model replaces arbitrary caps
- **Adaptive rate limiting**: Dynamic allocation of free capacity based on paid demand using EMA (Exponential Moving Average)
- **Built-in accountability**: Automatic oracle strike system with suspension for bad behavior
- **Transparent governance**: Block Producer multisig control over oracle selection and parameters
- **Secure notification delivery**: Standard Antelope `require_recipient` pattern
- **Backwards compatible**: Existing dApps continue working indefinitely without code changes
- **Predictable CPU usage**: Consistent resource consumption patterns

## Development Guidelines

### Smart Contract Development
- **Security first**: This project requires deep awareness of EOSIO smart contract security and attack vectors
- **Security considerations**: Command injection, XSS, SQL injection, and OWASP top 10 vulnerabilities must be avoided
- All contract logic resides in `src/orng.cpp`
- Contract interface defined in `include/orng.hpp`
- Use existing multi-index table patterns for consistency
- Maintain RSA signature verification integrity - this is critical for security
- All state changes must maintain invariants (see "Important Invariants" section)

### Testing Approach
- Integration tests simulate full oracle behavior
- RSA key generation and signing utilities in `tests/rsaSigning.js`
- Test with multiple oracle coordination scenarios
- Verify economic throttling and rate limiting
- Test error handling and edge cases

### Code Style
- C++: Follow EOSIO CDT conventions
- JavaScript: Use Prettier with single quotes and trailing commas
- No specific linting commands beyond Prettier

## Key Implementation Details

### Staking Model
- **Memo format**: `stake-<dapp_name>` or `deposit-<dapp_name>` (replaces old `stake`/`deposit`)
- **Third-party staking**: Any account can stake/deposit for any dApp (enables sponsorships, user contributions, guild funding)
- **Individual tracking**: `userstakes` table (scoped by dApp) tracks each user's contribution separately
- **Unstake timer reset**: Multiple unstake requests before claiming reset the maturity timer (prevents gaming the delay)
- **Immediate reduction**: Stakes/credits reduced immediately on `unstakeuser`, not on `claimfund`
- **Design rationale**: Timer reset ensures all accumulated unstake amounts are subject to full maturity period

### Adaptive Rate Limiting System
- **Dynamic capacity allocation**: Free tier capacity adjusts based on paid demand
- **EMA tracking**: Uses Exponential Moving Average to smooth paid request rate over time
  - Formula: `paid_rate_ema = g * prev_ema + (1-g) * inst_rate` where `g = exp(-dt/tau)`
  - `tau = ema_half_life_sec / ln(2)`, typically 15 minutes (900 seconds)
  - Minimum update interval (`ema_min_update_sec`): 10 seconds to avoid excessive updates
- **Free capacity calculation**: `T_free = total_capacity - headroom - paid_rate_ema`
  - `total_capacity_calls_per_hr`: Maximum system capacity (default: 18000 calls/hr)
  - `headroom_calls_per_hr`: Reserved buffer for paid calls (default: 1800 calls/hr)
  - `free_min_calls_per_hr`: Guaranteed minimum free capacity (default: 900 calls/hr)
  - Result: `max(free_min, T_free)` ensures minimum free capacity always available
- **Per-dApp allocation**: Each dApp gets proportional share based on stake: `rate_dapp = max(per_dapp_min, T_free * (s_dapp / S_total))`
- **Paid call tracking**: Only paid calls increment `paid_count_window`; free calls using credits don't affect EMA
- **Key actions**:
  - `configadptive`: Configure adaptive parameters (requires contract authority)
- **Implementation**: See `_update_paid_ema()` in `src/orng.cpp:124` and `_refill()` for credit allocation

### Notification Delivery System
- **Modern approach**: All new dApps use `[[eosio::on_notify("orng.wax::randnotify")]]` handlers (default)
- **Legacy support**: Existing dApps captured during the initial collection phase (ended December 3, 2025) continue using `receiverand` callback
- **Error recovery**: Failed deliveries stored in `undelivered` table with `getresult` and `retrydeliver` actions

### Notification Pattern (v3.x)
- **New dApps**: Use `[[eosio::on_notify("orng.wax::randnotify")]]` handler to receive random values (required for all new integrations)
- **Legacy support**: Old `receiverand` callback pattern continues to work for dApps that were captured during the collection phase
- **Collection phase ended**: December 3, 2025 - all new dApps automatically use the notification pattern - no action required

### Important Invariants
- Total stake in `acctstate` **must equal** sum of all user stakes in `userstakes` for that dApp
- Total stake in `stakestats` singleton **must equal** sum of all stakes in `acctstate` across all dApps
- Credits refill based on adaptive rate limiting: `rate_dapp = max(per_dapp_min, T_free * (s_dapp / S_total))`
- Only one unstake request per user per dApp (amounts accumulate, timer resets)
- RSA signature verification must succeed before any random number delivery
- EMA updates only occur when `dt >= ema_min_update_sec` (prevents excessive computation)
- Free calls (using credits) do NOT increment `paid_count_window` or affect paid rate EMA

## Key Files

### Smart Contract
- `src/orng.cpp` - Main smart contract implementation
- `include/orng.hpp` - Contract header with class definitions and tables

### Tests
- `tests/waxorng.test.js` - Main test suite with comprehensive oracle simulation, includes tests for:
  - Configuration actions (`setconfig`, `configv2`, `configadptive`)
  - Staking mechanics (stake/unstake flows)
  - Oracle operations and threshold signatures
  - Request/response flows and error handling
- `tests/adaptiveStaking.test.js` - Adaptive rate limiting and EMA calculation tests:
  - `_update_paid_ema` behavior with paid vs free calls
  - EMA calculation verification with JavaScript implementation
  - Time-based accumulation and window reset logic
- `tests/callback_test.test.js` - Additional callback testing
- `tests/rsaSigning.js` - RSA key generation and signing utilities for testing
- `tests/randreceiver/` - Example dApp receiver contracts (v1, v2, v3)

### Documentation
- `README.md` - Comprehensive integration guide for dApp developers
- `docs/RNG-V2-doc.md` - Technical specification for v2/v3 upgrade
- `docs/STAKING-MECHANICS.md` - Detailed staking and unstaking documentation
- `docs/code_hash-allowlist.md` - Legacy compatibility and allowlist information

### Configuration
- `Makefile` - Build and deployment automation
- `package.json` - Node.js dependencies and scripts
- `jest.config.js` - Test framework configuration (10-minute timeout)

## Deployment

### Networks
- **Testnet**: `make deploy-testnet` (uses https://testnet.wax.pink.gg)
- **Mainnet**: `make deploy-mainnet` (uses https://wax.greymass.com)

### Contract Info
- **Name**: orng
- **Account**: orng.wax
- **Version**: 3.2.0
- **Docker image**: waxteam/waxdev:v5.0.3wax02-v4.0.1-wax1.0.0
- **CDT compiler**: cdt-cpp with -O3 optimization

## Branch Structure
- **Main branch**: `develop`

## Example Integration

### Example Contracts
- `example/src/dicegame.cpp` - Simple dice game demonstrating basic integration
- `tests/randreceiver/randreceiver.cpp` - v1 legacy callback pattern
- `tests/randreceiver/randreceiverv2.cpp` - v2 transition pattern
- `tests/randreceiver/randreceiverv3.cpp` - v3 notification pattern (recommended for new dApps)

### Integration Pattern for New dApps
1. Implement `[[eosio::on_notify("orng.wax::randnotify")]]` handler
2. Store pending requests with unique `assoc_id` for coordination
3. Call `requestrand(assoc_id, seed, caller)` with transaction hash as seed
4. Receive random value via notification, match by `assoc_id`
5. Handle failed deliveries via `undelivered` table if needed

## Domain Expertise

When working on this codebase, consider:
- **EOSIO/Antelope smart contract security**: This is a high-value contract requiring expert-level security knowledge
- **Cryptographic operations**: RSA signature verification, Shamir secret sharing, threshold cryptography
- **Blockchain randomness**: Signidice algorithm, unpredictability vs uniqueness tradeoffs
- **Economic game theory**: Incentive alignment, oracle accountability, staking mechanisms
- **Multi-oracle coordination**: Threshold signatures, strike systems, decentralized key custody
- **Smart contract attack vectors**: Reentrancy, integer overflow, authorization bypasses, etc.
- **State machine design**: Request/response flows, pending state management, error recovery