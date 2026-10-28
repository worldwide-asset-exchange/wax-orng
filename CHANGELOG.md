# Changelog

## Pending (v3.4.0)

BREAKING CHANGES:

FEATURES:

IMPROVEMENTS:

BUG FIXES:
- [WBP-2064] `setrand` / `markfailed` accept only the canonical spelling of the RSA signature:
  lower-case hex, exactly the length of the active key modulus (leading zeroes kept, nothing
  truncated or appended). The verifier parses the signature as an integer while the delivered
  value is `sha256` over the submitted string, so every other spelling of the same signature
  (upper/mixed case, unpadded, NUL-suffixed) used to verify and deliver a different `rnd`.
  Compatibility: `rnd` for a canonical signature is unchanged (`sha256` of the same string), and
  members already emit that form. A non-canonical string now fails the transaction with a
  descriptive assert instead of counting as a strike; a well-formed but wrong signature still
  strikes. Partial signatures (`submitpart`) are not affected.
- [WBP-2064] `setpubkey` requires the modulus to be lower-case hex with an even number of digits,
  the spelling the signature check above measures against (the live key already is).
- [WBP-2064] `submitpart` requires the oracle's authority (`require_auth(oracle)`), like every
  other oracle action. Any permission that satisfies `require_auth(oracle)` works: `active`, or a
  custom permission linked to `submitpart` (the members' `rngops` permission is).
- [WBP-2064] `_refill` keeps the fraction of a credit that has not matured yet instead of flooring
  it away and resetting the clock on every call. Any account could reach `_refill` for any dApp
  through a `stake-<dapp>` transfer, so a periodic dust stake used to hold a dApp's free tier at
  zero. Accrual is fixed point: the entitlement for the elapsed time is added in nanocredits
  (1e-9 credit) to the new `acctstate.credits_nano` field, whole credits move to `credits`, and
  `last_update` is the time of the last refill. Rounding is floor at the nanocredit, so a refill
  under-credits by less than 1e-9 credit (a credit that is a few nanocredits short lands on the
  next refill) and can never over-credit, however often the row is refilled and at any rate; the
  fraction is stored in credits, not time, so a stake or capacity change between refills neither
  gains nor loses it. At the burst cap nothing is banked, so the cap and the
  `stakestats == sum(acctstate.stake)` invariant are unchanged; `last_update == 0` rows refill to
  the cap without overflow. (A seconds-resolution clock was considered first: it still lost up to
  half the entitlement to 1 s pings for dApps whose credit period is near one second, and a
  remainder kept as seconds is re-valued when the rate changes.)
  **ABI change:** `credits_nano` is a `binary_extension<uint32>` (`uint32$`) appended to
  `acctstate`. Rows written before v3.4.0 read as absent (= 0) and are rewritten with the field
  (+4 bytes RAM each, paid by the contract) on their first refill; no migration action. The deploy
  needs `setabi` as well as `setcode` (runbook 14: read `acctstate` back after `setabi`).

## v3.3.0 (2026-10-27, mainnet code hash f9f1e88013f5ea6b9e90ac24793f1ab4cdaf5c128d369127fb74b482a3e63c41)

BREAKING CHANGES:

FEATURES:
- [WBP-2058] `reconcile()` (contract authority): sets `treasury.pool_balance` to the WAX the account
  actually holds for the treasury - the eosio.token balance less dApp stakes (checked against
  `stakestats`), every pending unstake, dApp fee deposits, oracles' unpaid fees and the fees owed on
  in-flight paid requests. Refuses when `stakestats` disagrees with the acctstate stakes and when the
  liabilities exceed the balance; idempotent otherwise. Corrects the counter the system contract
  reads to size its RNG deposits (6,000,000 WAX recorded against 790,355 WAX held on 2026-10-26).
  Deploy order: `eosio::addornghash(<new hash>)` before `setcode`, or the system contract stops
  depositing (runbook 14 in wax-system-contracts), then `reconcile` once.
- [WBP-2058] Fix: the `accounts` view used by `reconcile` is declared outside the contract class so
  abigen no longer emits a dangling `accounts` table. The ABI built from the first reconcile commit
  was rejected by nodeos (`invalid_type_inside_abi`) and broke every table read against orng.wax
  until it was replaced. ABI-only fix, wasm unchanged.

IMPROVEMENTS:

BUG FIXES:

## v1.2.0

BREAKING CHANGES:

FEATURES:

IMPROVEMENTS:
- [KEW-1493] Job id auto index generator.
- [KEW-1456] Remove complete jobs from the jobs table.
- [KEW-1452] Remove signing_value from the jobs table.
- [KEW-1304] Add Travis CI
- [KEW-1299] Update README file
- [KEW-1212] Update to CDT 1.6.x
- [KEW-1451] Sending (checksum256) Hashed Random Value to receiverand
- [KEW-1495] Add missing unit tests for killjobs action/Fix contract version: 1.2.x.y instead of 1.3.x.y)

BUG FIXES:
- [KEW-1501] Fix multi-footer table parser.

## v1.1.0

BREAKING CHANGES:
- [KEW-1213] Refactor orng functions (actions)

FEATURES:

IMPROVEMENTS:
- [KEW-1262] Remove dependencies in order to be ready for open sourcing

BUG FIXES:

## v1.0.0

BREAKING CHANGES:
- [WD-1035] Update smart contract names ('wax.' prefix is now a suffix '.wax')

FEATURES:
- [WD-411] Native RSA sig verification.
- [WD-846] Create request random seed action.
- [WD-938] Set signature public key action.

IMPROVEMENTS:
- [WD-851] Standardize the sc code.
- [WD-815] Change signing data type from string to checksum256.
- [WD-892] Signing data is now uint64 and is stored in order to avoid its reuse.
- [WD-888] Remove eosio.token dependency.
- [WD-985] SC adapted to built-in rsa verification. All dependencies included in tests. 
- [WD-809] Adjust action permissions
- [WD-1040] Update output names (e.g. contract.wasm/abi -> wax.contract.wasm/abi)
- [WD-1059] Rename NFT::upsertapp calls to NFT::insertapp
- [KEW-92] RAM payer for ORNG
- [KEW-21] Update CI and dockerized deploy developer images to the latest available
- [KEW-1216] Refactor seed column name to random_value
- [KEW-1240] Update tests witn new SCs (vgo, irl, nft, giftbox)

BUG FIXES:
- [WD-815] Fix recrndseed account.
