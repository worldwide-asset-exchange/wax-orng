# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WAX ORNG is a blockchain-native random number generation service for the WAX blockchain. It implements a 2-of-3 threshold RSA signature scheme for decentralized randomness based on the Signidice algorithm.

## Development Commands

### Build & Test
```bash
# Install dependencies
npm install

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

### Docker Development
```bash
# Start development container
make dev-docker-start

# Build inside container
make docker-build
```

## Architecture

### Smart Contract (C++)
- **Main contract**: `src/orng.cpp` with header `include/orng.hpp`
- **Framework**: EOSIO/WAX smart contract using CDT
- **Version**: 2.0.0 (major upgrade with breaking changes)
- **Deployment**: Contract account is `orng.wax`

### Key Components
- **Threshold RSA**: 2-of-3 oracle signature scheme using Shamir secret sharing
- **Rate limiting**: Stake-meter bucket system + 0.05 WAX fee structure
- **Oracle management**: Automatic strike-and-suspend system for bad signatures
- **Bandwidth management**: Optional bandwidth payer system for dApps

### Data Structures
- Multi-index tables for persistent storage
- RSA signature verification on-chain
- SHA-256 hashing for message construction
- State machine pattern for request/response flow

### Version 2 Upgrade Features
- Decentralized key custody (no single point of failure)
- Economic throttling replaces arbitrary caps
- Built-in oracle accountability with automatic strikes
- BP multisig governance controls
- Predictable CPU usage patterns

## Development Guidelines

### Smart Contract Development
- Follow EOSIO smart contract best practices
- All contract logic resides in `src/orng.cpp`
- Contract interface defined in `include/orng.hpp`
- Use existing multi-index table patterns
- Maintain RSA signature verification integrity

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

## Key Files

- `src/orng.cpp` - Main smart contract implementation
- `include/orng.hpp` - Contract header with class definitions and tables
- `include/contract_info.hpp` - Auto-generated contract metadata
- `tests/waxorng.test.js` - Main test suite
- `tests/rsaSigning.js` - RSA signing utilities for testing
- `docs/RNG-V2-doc.md` - Technical specification for v2 upgrade

## Deployment

### Networks
- **Testnet**: `make deploy-testnet` (uses https://testnet.wax.pink.gg)
- **Mainnet**: `make deploy-mainnet` (uses https://wax.greymass.com)

### Contract Info
- **Name**: orng
- **Version**: 2.0.0.0
- **Account**: orng.wax
- **Docker**: waxteam/waxdev:v5.0.3wax02-v4.0.1-wax1.0.0

## Branch Structure
- **Main branch**: `develop`
- **Current feature branch**: `feat/time-fixes` (time-related fixes)

## Domain Expertise

When working on this codebase, consider:
- EOSIO smart contract security best practices
- RSA cryptographic operations and threshold signatures
- Blockchain randomness generation challenges
- Economic incentive design for oracle systems
- Multi-signature coordination and verification