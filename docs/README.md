# wax-orng documentation index

`orng.wax` is a Signidice-style randomness service: a dApp calls `requestrand`, each of the three
oracle members submits a partial RSA signature (`submitpart`), the contract combines and verifies
the full signature on-chain against the active `pubkeys` row, hashes it to the random value and
delivers it (`randnotify`, or the legacy `receiverand` for allow-listed dApps). The signing key is
Shoup threshold RSA, 2-of-3, 4096-bit: a trusted-dealer key ceremony deals one share to each
member (no distributed key generation, no resharing; rotation is a new ceremony and a new key
version). The contract account is governed by the producer multisig, which sets members, key
versions and economics. Documents that describe anything else are historical and have been removed.

## In this repository

| Document | What it covers |
| --- | --- |
| [`../README.md`](../README.md) | dApp integration: `requestrand`, `randnotify` handler, staking and paid tiers, error recovery, oracle economics |
| [`GOVERNANCE-RUNBOOK.md`](GOVERNANCE-RUNBOOK.md) | operating `orng.wax` from the producer multisig: every governance action, member/key sequences, contract upgrade (§5.3), emergencies, state reference |
| [`STAKING-MECHANICS.md`](STAKING-MECHANICS.md) | free-tier staking, adaptive rate allocation, unstake maturity |
| [`code_hash-allowlist.md`](code_hash-allowlist.md) | the code-hash allow-list that keeps legacy `receiverand` dApps working |
| [`TESTING-MIGRATION-GUIDE.md`](TESTING-MIGRATION-GUIDE.md) | test framework migration (qtest-js → vert) |
| [`vert.md`](vert.md) | notes on the vert blockchain emulator used by the tests |
| [`../CHANGELOG.md`](../CHANGELOG.md) | releases; each mainnet release lists its code hash |

## External

| Document | What it covers |
| --- | --- |
| [Operator guide](https://github.com/worldwide-asset-exchange/wax-rng-oracle/blob/main/docs/OPERATOR-GUIDE.md) (wax-rng-oracle) | running a signing member: permissions, receiving a share, configuration, boot self-check, monitoring |
| [Key ceremony runbook](https://github.com/worldwide-asset-exchange/rsa-threshold-sigs-js/blob/main/docs/KEY-CEREMONY.md) (rsa-threshold-sigs-js) | dealing the 2-of-3 shares and producing the `setpubkey` values |
| [Runbook 14 — allow-listed contract upgrade](https://github.com/worldwide-asset-exchange/wax-system-contracts/blob/develop/docs/04_guides/14_runbook-allowlisted-contract-upgrade.md) (wax-system-contracts) | the `eosio` side of an `orng.wax` upgrade: reproducible build, `addornghash` / `rmornghash`, hash history |

Source of truth for every action, table and field name: `include/orng.hpp` and `src/orng.cpp`.
