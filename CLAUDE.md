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
- **Test file**: `tests/waxorng.test.js`
- **Test environment**: Simulated blockchain using qtest-js
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
- **Version**: 2.0.0 (major upgrade with breaking changes)
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
  - `reqs`: Pending random number requests with full request lifecycle
  - `oracles.a`: Oracle registration, strikes, and suspension tracking
  - `pubkeys`: RSA public keys with versioning
  - `undelivered`: Failed callback results for later retrieval
  - `balances`: Oracle reward tracking
- **RSA signature verification** on-chain
- **SHA-256 hashing** for message construction (`sha256(seed || dapp_name || nonce)`)
- **State machine pattern** for request/response flow

### Version 2 Upgrade Features
- Decentralized key custody (no single point of failure)
- Economic throttling replaces arbitrary caps
- Built-in oracle accountability with automatic strikes
- BP multisig governance controls
- Predictable CPU usage patterns

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
- **Memo formats**:
  - `stake-<dapp_name>`: Stake WAX for a dApp (earns 3 credits per WAX per hour)
  - `deposit-<dapp_name>`: Direct credit purchase for a dApp (0.05 WAX per credit)
  - `treasury`: Fund oracle reward pool
- **Third-party staking**: Any account can stake/deposit for any dApp (enables sponsorships, guilds, users)
- **Individual tracking**: `userstakes` table (scoped by dApp) tracks each user's contribution
- **Unstake timer reset**: Multiple unstake requests before claiming reset the maturity timer (prevents gaming)
- **Immediate reduction**: Stakes/credits reduced immediately on `unstakeuser`, not on `claimfund`
- **Design rationale**: Timer reset ensures all accumulated unstake amounts subject to full maturity period

### Request/Response Flow
1. **`requestrand`**: dApp initiates request with `assoc_id`, `signing_value`, and `caller`
2. **Oracle coordination**: 2-of-3 threshold signing with `submitpart` for transparency
3. **`setrand`**: Final signature submission and RSA verification
4. **Callback delivery**: Automatic `receiverand` callback to requesting dApp
5. **Failure handling**: `markfailed` + `undelivered` table for retry mechanism

### Important Invariants
- Total stake in `acctstate` = sum of all user stakes in `userstakes` for that dApp
- Credits refill based on total stake (3 per WAX per hour)
- Only one unstake request per user per dApp (amounts accumulate, timer resets)
- Nonce system prevents replay attacks (per-dApp nonce tracking)

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
- **Version**: 2.0.0
- **Account**: orng.wax
- **Docker**: waxteam/waxdev:v5.0.3wax02-v4.0.1-wax1.0.0

### Migration
- **`migrate2` action**: Upgrades v1 job format to v2 request format for backward compatibility

## Branch Structure
- **Main branch**: `develop`

## Domain Expertise

When working on this codebase, consider:
- EOSIO smart contract security best practices
- RSA cryptographic operations and threshold signatures
- Blockchain randomness generation challenges
- Economic incentive design for oracle systems
- Multi-signature coordination and verification