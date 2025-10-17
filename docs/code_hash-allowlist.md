Implement a code hash-based allowlist mechanism to safely migrate existing dApps from the current inline action callback pattern to the new require_recipient notification pattern. This allowlist will prevent RAM exploitation while ensuring backwards compatibility for existing integrations.

🚀 Key Advantages:

Leverages WAX's get_code_hash intrinsic for fully automated, trustless on-chain enforcement

Automatic legacy dApp collection during initial 1-2 week deployment period

Zero manual allowlist building required!

Background

The current callback mechanism uses inline actions with orng.wax authority, which creates a potential RAM exploitation vector. We are migrating to require_recipient notifications (already in development), but need a safe transition strategy for existing dApps.

Current Pattern (vulnerable):

action{
    permission_level{get_self(), "active"_n},  // orng.wax authority
    caller, "receiverand"_n,
    std::make_tuple(assoc_id, random_value)
}.send();

New Pattern (safe):

require_recipient(dapp);  // dApp handles via [[eosio::on_notify]]

Proposed Solution

Create a code hash-based allowlist that:

Automatically collects legacy dApps during initial 1-2 week deployment period

Permits existing, verified dApps to continue using legacy callback

Requires all new dApps to use the new notification pattern

Automatically transitions dApps when they upgrade their contract (code hash changes)

Provides governance controls (BP multisig) for managing the allowlist

Uses WAX's get_code_hash intrinsic for trustless on-chain verification

Key Innovations:

Automatic Collection Phase:

Upon mainnet deployment, enable collection mode for 7-14 days

As legacy dApps make RNG requests, automatically add them to allowlist

Capture their current code hash using get_code_hash

No manual dApp identification or hash calculation needed!

On-Chain Hash Verification:

Using on-chain code hash verification ensures that once a dApp upgrades, they are automatically and immediately moved to the safer callback mechanism

No off-chain monitoring needed - the contract enforces migration in real-time!

Technical Advantage: WAX has the get_code_hash(name account) intrinsic enabled, allowing fully automated, trustless enforcement without relying on off-chain monitoring or manual BP verification.

Acceptance Criteria

Must Have

[ ] New legacycb table with auto_collected field

[ ] New collectconfig singleton for collection mode configuration

[ ] Collection actions: enablecollect, disablecollect, resetcollect (BP multisig)

[ ] Automatic collection logic in requestrand action

[ ] Governance actions: addlegacy, rmlegacy, updatelegacy (BP multisig auth)

[ ] Public verifyhash action for community-driven cleanup

[ ] On-chain code hash verification using get_code_hash intrinsic

[ ] Modified setrand action supports dual callback mode with automatic hash verification

[ ] Modified retrydeliver and getresult support dual callback mode

[ ] Comprehensive unit tests for collection, callback paths, and hash verification

[ ] Integration tests with collection phase and contract upgrade scenarios

[ ] Migration guide for dApp developers

Should Have

[ ] Testnet deployment with real dApp testing

[ ] Documentation updates (README, technical spec)

Nice to Have

[ ] Analytics on migration progress (% of dApps migrated)

Technical Implementation

See detailed specification: CALLBACK_MIGRATION_SPEC.md

New Table Structure

struct [[eosio::table]] legacycallback {
    eosio::name dapp;
    eosio::checksum256 code_hash;
    eosio::time_point_sec added_time;
    eosio::time_point_sec sunset_time;
    uint64_t primary_key() const { return dapp.value; }
};

Key Functions

addlegacy(dapp, code_hash, sunset_months) - Add to allowlist (BP multisig)

rmlegacy(dapp) - Remove from allowlist (BP multisig)

updatelegacy(dapp, new_code_hash) - Update hash (BP multisig, exceptional cases)

verifyhash(dapp) - Public action to verify and auto-remove if code changed

can_use_legacy_callback(dapp) - Internal helper with automatic hash verification

Uses eosio::get_code_hash(account) for real-time on-chain verification

Testing Requirements

Unit Tests:

Add/remove/update allowlist entries

Legacy callback for allowlisted dApps with matching hash

New callback for non-allowlisted dApps

Automatic migration when code hash changes

verifyhash action functionality

Sunset enforcement

Duplicate prevention

get_code_hash consistency tests

Integration Tests:

Mixed dApp scenario (legacy + new)

Contract upgrade scenario with automatic hash detection

Failed delivery with both callback types

High load with dual callback routing

Performance impact of get_code_hash calls

Testnet Validation:

Deploy real test dApps

Verify get_code_hash returns expected values

Test upgrade triggers automatic migration

Test community verifyhash calls

Performance benchmarking

CPU cost analysis of hash verification

Dependencies

Existing ticket for require_recipient callback implementation