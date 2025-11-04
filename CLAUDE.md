# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WAX ORNG is a blockchain-native random number generation service for the WAX blockchain. It implements a 2-of-3 threshold RSA signature scheme for decentralized randomness based on the Signidice algorithm.

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
- **Framework**: Jest with 10-minute timeout for blockchain operations
- **Main test files**:
  - `tests/waxorng.test.js` - Comprehensive contract functionality tests
  - `tests/callback_test.test.js` - Notification/callback pattern tests
- **Test environment**: Simulated blockchain using qtest-js
- **RSA utilities**: `tests/rsaSigning.js` - Key generation and signature verification
- **Test contracts**: `tests/contracts/` and `tests/randreceiver/` - Example dApp implementations
- **Run specific test**: `npm test -- --testNamePattern="test name"`

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
- **Version**: 3.0.x (major upgrade from v1.x with backwards compatibility)
- **Deployment**: Contract account is `orng.wax`

### Key Components
- **Threshold RSA**: 2-of-3 oracle signature scheme using Shamir secret sharing
- **Economic model**: Two-tier system:
  - **Free tier**: Anyone can stake WAX for a dApp using memo `stake-<dapp_name>` to earn 3 free calls per WAX per hour (refills automatically)
  - **Paid tier**: Anyone can deposit WAX for a dApp using memo `deposit-<dapp_name>` at 0.05 WAX per call when credits are exhausted
- **Flexible staking**: Any account (users, sponsors, guilds, or dApp itself) can stake for any dApp
- **Individual tracking**: Each staker's contribution tracked separately in `userstakes` table (scoped by dApp)
- **Two-step unstaking**: `unstakeuser` → 48hr maturity → `claimfund` (timer resets on multiple unstake requests)
- **Oracle management**: Automatic strike-and-suspend system for bad signatures
- **Bandwidth management**: Optional bandwidth payer system for dApps

### Data Structures
- **Multi-index tables** for persistent storage:
  - `acctstate`: Total stake and credits per dApp (scope: orng.wax)
  - `userstakes`: Individual user stakes per dApp (scope: dApp account)
  - `unstake`: Pending unstake requests with maturity timer (scope: dApp account)
  - `reqs`: Pending random number requests
  - `oracles.a`: Oracle registration and strike tracking
- **RSA signature verification** on-chain
- **SHA-256 hashing** for message construction
- **State machine pattern** for request/response flow

### Version 3 Upgrade Features
- **Decentralized key custody**: 2-of-3 threshold RSA (no single point of failure)
- **Economic throttling**: Stake-based free tier + pay-per-use model replaces arbitrary caps
- **Built-in oracle accountability**: Automatic strike system with suspension
- **BP multisig governance**: Transparent oracle selection and parameter control
- **Secure notification delivery**: Uses standard Antelope `require_recipient` pattern
- **Backwards compatible**: Existing v1.x dApps continue working indefinitely without code changes
- **Legacy collection phase**: Automatic detection and support for old `receiverand` callback pattern

## Development Guidelines

### Smart Contract Development
- Follow EOSIO smart contract best practices and security considerations
- All contract logic resides in `src/orng.cpp`
- Contract interface defined in `include/orng.hpp`
- `include/contract_info.hpp` is auto-generated during build - do not edit manually
- Use existing multi-index table patterns
- Maintain RSA signature verification integrity
- Be aware of smart contract attack vectors and implement secure patterns

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
- **Third-party staking**: Any account can stake/deposit for any dApp (enables sponsorships)
- **Individual tracking**: `userstakes` table (scoped by dApp) tracks each user's contribution
- **Unstake timer reset**: Multiple unstake requests before claiming reset the maturity timer (prevents gaming)
- **Immediate reduction**: Stakes/credits reduced immediately on `unstakeuser`, not on `claimfund`
- **Design rationale**: Timer reset ensures all accumulated unstake amounts subject to full maturity period

### Notification Pattern (v3.0)
- **New dApps**: Use `[[eosio::on_notify("orng.wax::randnotify")]]` handler to receive random values
- **Legacy support**: Old `receiverand` callback pattern automatically supported during collection phase
- **skiplegacy action**: New dApps deploying during collection phase must call `skiplegacy` to opt into notifications
- **Collection phase**: Limited-time window where system builds compatibility list of existing dApps
- **After collection**: All new dApps automatically use notification pattern without `skiplegacy`

### Important Invariants
- Total stake in `acctstate` = sum of all user stakes in `userstakes` for that dApp
- Credits refill based on total stake (3 per WAX per hour)
- Only one unstake request per user per dApp (amounts accumulate, timer resets)
- Random values always delivered via notification to prevent callback manipulation

## Key Files

- `src/orng.cpp` - Main smart contract implementation
- `include/orng.hpp` - Contract header with class definitions and tables
- `include/contract_info.hpp` - Auto-generated contract metadata
- `tests/waxorng.test.js` - Main test suite
- `tests/rsaSigning.js` - RSA signing utilities for testing
- `docs/RNG-V2-doc.md` - Technical specification for v2 upgrade
- `docs/STAKING-MECHANICS.md` - Detailed staking and unstaking documentation

## Deployment

### Networks
- **Testnet**: `make deploy-testnet` (uses https://testnet.wax.pink.gg)
- **Mainnet**: `make deploy-mainnet` (uses https://wax.greymass.com)

### Contract Info
- **Name**: orng
- **Version**: 3.0.x (see package.json for current version)
- **Account**: orng.wax
- **Docker**: waxteam/waxdev:v5.0.3wax02-v4.0.1-wax1.0.0
- **Build requirement**: `make build` requires `contract_info` target (generates `include/contract_info.hpp`)

## Branch Structure
- **Main branch**: `develop`

## Domain Expertise

When working on this codebase, consider:
- EOSIO smart contract security best practices
- RSA cryptographic operations and threshold signatures
- Blockchain randomness generation challenges
- Economic incentive design for oracle systems
- Multi-signature coordination and verification