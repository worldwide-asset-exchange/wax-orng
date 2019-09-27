# Changelog

## Pending (xX.Y.Z)

BREAKING CHANGES:

FEATURES:
- [KEW-1564] Upgrade to WAX Blockchain v1.8.4.
- [KEW-1564] Upgrade to WAX Blockchain v1.8.3.

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
