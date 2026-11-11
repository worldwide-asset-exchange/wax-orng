# Governance runbook — operating `orng.wax` from the producer multisig

Companion to the member-side
[operator guide](https://github.com/worldwide-asset-exchange/wax-rng-oracle/blob/main/docs/OPERATOR-GUIDE.md).
Written against contract **v3.4.0** (`src/orng.cpp`, mainnet code hash `fa4bee5f…`). Every
check message quoted here is the string the contract asserts with. Placeholders are in angle
brackets. Nothing here is a key, a share or a secret.

## 1. Model and how to read this

**Target model.** `orng.wax@owner` and `orng.wax@active` are held by `eosio.prods@active`, the
producer schedule's multisig (the system contract rewrites that permission on every schedule
change; its threshold is 2/3 + 1 of the active schedule). `orng.wax@eosio.code` stays on `active`
so the contract's inline actions (`eosio.token::transfer` from `claim` / `claimfund`,
`randnotify`, legacy `receiverand`) keep working. Every contract action that does
`require_auth(get_self())` is therefore an `eosio.msig` proposal that producers approve. The
`eosio` side of a contract upgrade (`addornghash` / `rmornghash`) is also an `eosio.prods`
proposal in this model. Key shares come from a trusted-dealer ceremony (library Shoup scheme, one
run deals every share; no DKG, no resharing) — see the key ceremony runbook.

Until the handover (section 3) has executed, the live permissions differ; read them with
`cleos get account orng.wax` before proposing anything, and use whatever `orng.wax@active`
resolves to as the `requested` set.

Sections: 2 msig mechanics (once) · 3 handover · 4 every governance action · 5 sequences ·
6 state reference and the post-change checklist.

## 2. Multisig mechanics

```bash
API=https://wax.greymass.com
# the producers' active permissions, from the live eosio.prods@active authority
REQ=$(cleos -u $API get account eosio.prods -j | jq -c '[.permissions[]|select(.perm_name=="active")|.required_auth.accounts[]|{actor:.permission.actor,permission:"active"}]')
AUTH='[{"actor":"orng.wax","permission":"active"}]'      # trx_permissions: what the proposed action runs as
PROPOSER=<proposer>                                      # any account; pays the proposal RAM

# single action
cleos -u $API multisig propose <name> "$REQ" "$AUTH" orng.wax <action> '<json args>' $PROPOSER 168 -p $PROPOSER@active
# several actions in one transaction (atomic): write a transaction JSON, then
cleos -u $API multisig propose_trx <name> "$REQ" <trx.json> $PROPOSER -p $PROPOSER@active

cleos -u $API multisig review $PROPOSER <name> --show-approvals     # decoded payload + who approved
cleos -u $API multisig approve $PROPOSER <name> '{"actor":"<producer>","permission":"active"}' -p <producer>@active
cleos -u $API multisig exec    $PROPOSER <name> <executer> -p <executer>@active
cleos -u $API multisig cancel  $PROPOSER <name> $PROPOSER -p $PROPOSER@active
```

- `168` is the expiry in hours (7 days). An expired proposal cannot be executed; propose again.
- `exec` needs only the executer's own authority. Once the approvals are in, any account can
  execute at any moment before expiry — so approvals are collected over days and the execution
  is a single command by one person at the time of your choosing. Sequence 5.1 is built on this.
- `exec` checks the approvals against the **current** `eosio.prods@active`. If the schedule changed
  since `propose`, approvals from producers who left no longer count and newcomers are not in
  `requested`; cancel and propose again.
- Only approve a proposal you have decoded. `review` decodes `transaction.actions[].data` with the
  chain ABI (`cleos get abi orng.wax`); check `account`, `name`, `authorization` and every field
  against this runbook. For `setcode`, hash the payload yourself:
  `cleos multisig review $PROPOSER <name> -j | jq -r '.transaction.actions[0].data.code' | xxd -r -p | sha256sum`.
- To bind your approval to the exact bytes, pass the proposal hash:
  `H=$(cleos multisig review $PROPOSER <name> -j | jq -r .packed_transaction | xxd -r -p | sha256sum | cut -c1-64)`
  then `cleos multisig approve $PROPOSER <name> '{...}' $H -p <producer>@active`; the approval
  fails if the proposal was replaced.
- `orng.wax` pays RAM for every table row governance writes (payer `get_self()` throughout);
  watch `ram_usage` in `cleos get account orng.wax` after large `setoracles` / `addlegacy` runs.

## 3. Handover to `eosio.prods`

Proposed by the **current holder** of `orng.wax@owner` with its own signers as `requested`.
Order: `active` first, test one harmless producer-approved action, clean up the child
permissions, `owner` last — so the current holder can still undo step 1 if the producer path
does not work.

| Step | Action (`eosio` contract) | Signed as | Payload |
|---|---|---|---|
| 1 | `updateauth` | `orng.wax@owner` | `{"account":"orng.wax","permission":"active","parent":"owner","auth":{"threshold":1,"keys":[],"accounts":[{"permission":{"actor":"eosio.prods","permission":"active"},"weight":1},{"permission":{"actor":"orng.wax","permission":"eosio.code"},"weight":1}],"waits":[]}}` |
| 2 | `pauserequest` (`orng.wax`) | `orng.wax@active` | `{"paused":false}` — a no-op write while unpaused; proposed with `$REQ` = producers, proves the new path end to end |
| 3 | `unlinkauth` ×2, `deleteauth` | `orng.wax@active` | child permission `deploy` (linked to `eosio::setcode` / `setabi`): `{"account":"orng.wax","code":"eosio","type":"setcode"}`, same for `setabi`, then `{"account":"orng.wax","permission":"deploy"}`. It lets a third account deploy code without producers; delete it or re-point it deliberately |
| 4 | `unlinkauth` ×2, `deleteauth` | `orng.wax@active` | child permission `pause` (linked to `orng.wax::pause` / `pauserequest`): delete, or keep as a producers-chosen emergency responder — decide explicitly |
| 5 | `updateauth` | `orng.wax@owner` | `{"account":"orng.wax","permission":"owner","parent":"","auth":{"threshold":1,"keys":[],"accounts":[{"permission":{"actor":"eosio.prods","permission":"active"},"weight":1}],"waits":[]}}` |

Verify after each step:

```bash
cleos -u $API get account orng.wax          # owner/active list eosio.prods@active; active also lists orng.wax@eosio.code
cleos -u $API get account eosio.prods       # the producer set and threshold that now governs the contract
```

A step-1 proposal is signed as `owner`, so its `requested` is the current owner's signers; from
step 2 on, `requested` is `$REQ` (producers) — step 2 exists precisely to exercise that path
before the fallback permissions are deleted. Steps 3–4 can share one `propose_trx`.

## 4. Governance actions

All of these `require_auth(get_self())`, i.e. `orng.wax@active` via the msig; the template
column is the `<action> '<json>'` part of a `propose` line from section 2. "Paused?" says
whether the action itself refuses while `pause(true)` is set (`"Contract is paused"`).

### 4.1 Membership

| Action | Checks | Writes / side effects | Paused? |
|---|---|---|---|
| `setoracles(name[] oracles)` | none — no `is_account`, no duplicate, no count check | **Erases every `oracles.a` row** and re-adds the list in order with `oracle_index` 1..N, `strikes 0`, `suspended false`. For each listed member creates its `ostip.a` row (`active true`, clocks = now, `usd_accrued 0`) or sets `active true` on the existing one, accrued amount kept. Rows in `ostip.a` for members **not** listed are untouched and keep accruing (see 5.1). | no |
| `resetsuspen(name account)` | `"unknown oracle"` | `strikes 0`, `suspended false`; `ostip.a`: accrues to now, `active true`, `last_accrue now` | no |
| `setstipend(name oracle, bool active)` | `"unknown oracle"` (must be in `oracles.a` **now**) | creates the `ostip.a` row, or accrues to now then sets `active` | no |

```
setoracles  '{"oracles":["<m1>","<m2>","<m3>"]}'
resetsuspen '{"account":"<member>"}'
setstipend  '{"oracle":"<member>","active":false}'
```

Verify: `cleos get table orng.wax orng.wax oracles.a` (indices 1..N in list order) and `ostip.a`.
Members check `oracle_index == SHARE_KEY_SHARE_INDEX` at boot; a changed index is a boot failure
(`ORACLE_INDEX_MISMATCH`) for a restarted member and wrong-index partials for a running one.

### 4.2 Key versions

| Action | Checks | Writes / side effects | Paused? |
|---|---|---|---|
| `setpubkey(uint8 version, string exponent, string modulus)` | `"modulus must have non-zero length"`, `"modulus must have leading zeroes stripped"`, `"public key already exist"` (same modulus hash), `"key with this version has already existed"`, `"version must increment by 1"` (= highest existing `ver` + 1, or 1), `"modulus must be lower-case hex with an even number of digits (whole bytes)"`. The exponent is not validated — use the hex the ceremony recorded (`10001`). | Adds the `pubkeys` row and sets `config.a[activever] = version` — **active immediately**: the next `requestrand` carries the new `ver`. | yes |
| `retirepubkey(uint8 version)` | `"key not found"` | `retired true`. `setrand` / `markfailed` for any request still carrying that `ver` fail `"key retired"`. Does **not** change `activever`: retiring the active version leaves every new request unsignable. | no |

```
setpubkey    '{"version":<ver+1>,"exponent":"10001","modulus":"<lower-case hex n>"}'
retirepubkey '{"version":<old ver>}'
```

Verify: `pubkeys` has the new row, `config.a[activever]` equals it, and
`printf '%s' "<modulus>" | sha256sum` equals the ceremony fingerprint. Never `setpubkey` or
`retirepubkey` outside sequence 5.1 / 5.2.

### 4.3 Configuration

| Action | Checks | Writes / side effects | Paused? |
|---|---|---|---|
| `configv2(asset fee_per_call, uint8 strike_max)` | none; only `fee_per_call.amount` is stored (symbol ignored) | `config.a[feepercall]` (base units, 10⁻⁸ WAX), `config.a[strikesmax]`. `strike_max 0` suspends a member on its first bad full signature (`++strikes >= 0`). | no |
| `configv3(uint64 stipendmonth, uint64 minclaimint)` | none | `config.a[stipendmonth]` (USD × 10⁴ per 30 days: `3000000` = $300), `config.a[minclaimint]` (seconds between a member's claims) | no |
| `configadptive(uint32 ×7)` | none | Replaces the whole `adaptcfg` singleton: free-tier capacity, floor, headroom, per-dApp minimum, burst window (×100), EMA half-life and min update. Also sets a new dApp's initial credits (`per_dapp_min × burst / 100`). | no |
| `setconfig(name config, int64 value)` | none — writes any `config.a` row unvalidated | see the table below | no |
| `toggleallow(bool enabled)` | — | `config.a[allowlist]`. `0` sends **every** delivery as `randnotify`, legacy `receiverand` dApps included. | yes |
| `enablecoll(uint64 duration_seconds)` | `"duration must be positive"` | `collecten 1`, `collectst now`, `collectend now + duration`; while open, `requestrand` auto-adds unknown callers to `legacycb` with their current code hash (`auto_collected true`) | yes |
| `disablecoll()` | — | `collecten 0` | yes |
| `resetcoll()` | — | erases every `legacycb` row with `auto_collected true` (manual `addlegacy` rows stay) | yes |

`config.a` names the v3.4.0 code reads (`setconfig` can write any of them; prefer the dedicated
action where one exists):

| Name | Read by | Meaning | Default if absent | Mainnet 2026-11-03 |
|---|---|---|---|---|
| `paused` | `is_paused()` | global pause (4.5) | 0 | 0 |
| `pauserequest` | `requestrand` | request pause (4.5) | 0 | 0 |
| `activever` | `requestrand`, members' boot check | key version new requests carry | 0 → `"key version not set"` | 1 |
| `feepercall` | `requestrand`, `setrand`, `markfailed`, `retrydeliver`, `getresult`, `reconcile` | paid-call fee, base units | 0 | 1000000 (0.01 WAX) |
| `strikesmax` | `_validate_and_compute_rnd` | strikes before suspension | 0 (suspend on first) | 3 |
| `stipendmonth` | `_accrue_stipend` | USD × 10⁴ per 30 days per member | 0 (no stipend) | 3000000 |
| `minclaimint` | `claim` | seconds between claims | 86400 | 86400 |
| `oraclereward` | `markfailed` | seconds a `undelivered1` row stays reward-eligible | 86400 | absent |
| `unstaketime` | `claimfund` | unstake maturity, seconds | 259200 | absent |
| `allowlist` | `_deliver_random` | legacy callbacks allowed | 0 | 1 |
| `collecten`, `collectst`, `collectend` | `requestrand` | collection window | 0 | 1 / 2025-11-03 / 2025-12-03 — flag still set but `collectend` has passed, so `requestrand` no longer auto-adds (it checks `now <= collectend`); `disablecoll` would tidy the flag |
| `requestindex` | `generate_next_index` | next request id — **never write it** | 0 | live counter |

Rows `fcallsperhr`, `jobid.index`, `kcallsperwax`, `treasfloor`, `v1sigcln.idx`, `version` exist
on mainnet but are not read by v3.4.0 (pre-v3 leftovers; harmless). `freemaxjobs` and
`callbackret` are named in the source but never read. Writing `activever` with `setconfig`
bypasses every `setpubkey` check — do not.

```
configv2     '{"fee_per_call":"0.01000000 WAX","strike_max":3}'
configv3     '{"stipendmonth":3000000,"minclaimint":86400}'
configadptive '{"total_capacity_calls_per_hr":18000,"free_min_calls_per_hr":900,"headroom_calls_per_hr":1000,"per_dapp_min_calls_per_hr":10,"burst_window_hours":100,"ema_half_life_sec":900,"ema_min_update_sec":10}'
setconfig    '{"config":"unstaketime","value":259200}'
toggleallow  '{"enabled":true}'
enablecoll   '{"duration_seconds":<seconds>}'      disablecoll '{}'      resetcoll '{}'
```

Verify: `cleos get table orng.wax orng.wax config.a` / `adaptcfg` read back the values.

### 4.4 dApp controls

| Action | Checks | Writes / side effects | Paused? |
|---|---|---|---|
| `ban(name dapp)` | `"Dapp already added to the banlist"` | `banlist.a` row; the dApp's next `requestrand` fails `"Account is banned from using this service"`; requests already in `reqs` still complete | no |
| `unban(name dapp)` | `"Dapp not in the banlist"` | erases the row | no |
| `addlegacy(name dapp)` | `"dapp account does not exist"`, `"dapp already in legacy callback list"` | `legacycb` row with the dApp's **current** `get_code_hash`, `auto_collected false`; with `allowlist` on it is delivered by inline `receiverand` while its hash matches | yes |
| `rmlegacy(name dapp)` | `"dapp not in legacy callback list"` | erases the row; the dApp is delivered by `randnotify` from then on | yes |
| `updatelegacy(name dapp, checksum256 new_code_hash)` | `"dapp not in legacy callback list"` | overwrites `code_hash`, unchecked — read `cleos get code <dapp>` first | yes |
| `verifyhash(name dapp)` | no authority needed (anyone) | erases the row if the live hash differs; nothing otherwise | yes |
| `killjobs(uint64[] job_ids)` | none; unknown ids are skipped | erases `reqs` rows. The dApp gets **no** result and no `undelivered1` row; a paid request's fee (debited at `requestrand`) is not refunded; the row's RAM goes back to the dApp. | no |

(`skiplegacy` is the dApp's own opt-out, signed by the dApp — not a governance action.)

```
ban          '{"dapp":"<dapp>"}'            unban     '{"dapp":"<dapp>"}'
addlegacy    '{"dapp":"<dapp>"}'            rmlegacy  '{"dapp":"<dapp>"}'
updatelegacy '{"dapp":"<dapp>","new_code_hash":"<64 hex>"}'
killjobs     '{"job_ids":[<id>,<id>]}'
```

Verify: `banlist.a` / `legacycb` / `reqs` read back.

### 4.5 Safety

| Action | Writes | What stops | What keeps working |
|---|---|---|---|
| `pause(bool paused)` | `config.a[paused]` | `requestrand`, `submitpart`, `setrand`, `markfailed` (in-flight requests freeze), `retrydeliver`, `cleanup`, `claim`, stake / deposit transfers, `unstakeuser`, `claimfund`, `skiplegacy`, `verifyhash`, and the governance actions marked "yes" above (`setpubkey`, `toggleallow`, collection and legacy-list actions) | `pause`, `pauserequest`, `setconfig`, `setoracles`, `resetsuspen`, `setstipend`, `retirepubkey`, `configv2/v3`, `configadptive`, `reconcile`, `killjobs`, `ban`/`unban`, `getresult`, treasury deposits |
| `pauserequest(bool paused)` | `config.a[pauserequest]` | only `requestrand`: `"Orng.wax are under maintenance, please try again later"` (the dApp's whole transaction fails) | everything else — members keep draining `reqs` |

```
pause        '{"paused":true}'        pauserequest '{"paused":true}'
```

Verify: `config.a[paused]` / `[pauserequest]`; `reqs` stops growing (request pause) or stops
changing at all (global pause).

### 4.6 Treasury-related

| Action | Checks | Writes / side effects |
|---|---|---|
| `reconcile()` | `"… no eosio.token WAX balance row …"`, `"stakestats.total_stake_amount (…) does not equal the sum of acctstate stakes (…)"`, `"WAX held for others (…) exceeds the WAX held (…)"` | sets `treasury.pool_balance` = token balance − stakes − pending unstakes − dApp fee deposits − members' unpaid fees − in-flight fees; idempotent; the trace prints old → new and every term. `eosio` sizes its carve-out deposits from this counter (`min(share, max_pool_rng − pool_balance)`), so run it after any out-of-band outflow. |
| `configv3`, `setstipend` | 4.1 / 4.3 | the stipend side of `claim`: what accrues and for whom |
| `randnotify(uint64 request_id, name dapp, uint64 assoc_id, checksum256 rnd)` | self-auth, inline use only | `require_recipient(dapp)`. A proposal could push it and fake a delivery — **never propose it**. |

```
reconcile '{}'
```

Funding itself (`rng_rate`, `max_pool_rng`) is `eosio` governance: wax-system-contracts
`docs/04_guides/11_runbook-rng-payouts.md`.

The 23 self-authorised actions above: `pause`, `pauserequest`, `setconfig`, `setpubkey`,
`retirepubkey`, `setoracles`, `resetsuspen`, `setstipend`, `reconcile`, `configv2`, `configv3`,
`configadptive`, `killjobs`, `ban`, `unban`, `toggleallow`, `enablecoll`, `disablecoll`,
`resetcoll`, `addlegacy`, `rmlegacy`, `updatelegacy`, `randnotify`.

## 5. Sequences

### 5.1 Replace or add a member (new key version)

Shares are dealt as one set for one modulus, so a member change is a re-key. Why a request
pause brackets the switch: a request's `ver` is fixed at `requestrand` (`reqs.ver`), `submitpart` /
`setrand` require `"version mismatch"`-free equality with it, `setpubkey` moves `activever` at
once, and a member signs only the version its boot check verified (operator guide 6.2). A
request created under the old key after the switch has nobody left to sign it.

There is no staged key on this contract: `setpubkey` activates at once, and a member boots only
against the active version. The switch is nevertheless **one executed transaction**, and all the
waiting happens before it — by the proposals (approved days ahead; section 2) and by the members
(started ahead, crash-looping on the boot check until the switch lands). At switch time one
person runs two `exec`s a few seconds apart; nobody else needs to be online.

1. **Ceremony.** Decide the new list and order; keep continuing members at their current
   positions where possible. The ceremony deals share `i` for position `i`; each member receives
   its share per the key ceremony runbook. Record the fingerprint `sha256(modulus)`.
2. **Members stage and start.** Every member of the new set configures its new share, index and
   account and **starts the process now** (operator guide 6.2). The boot check fails against the
   chain, which still carries the old key and the old list — `ORACLE_NOT_REGISTERED` for a new
   member, `expectedPublicKey` for a continuing one — the process exits 1 and systemd restarts it
   every few seconds for as long as it takes. That crash loop is the queue: nothing is signed or
   pushed, and the member goes live by itself within seconds of the switch. A continuing member
   runs the new-share process beside its old one (operator guide 6.2) so the old one keeps
   signing until the switch.
3. **Propose, then collect approvals** — over days, not in a window (section 2):
   - **A** — `pauserequest '{"paused":true}'`.
   - **B** — one `propose_trx`, in this order, so the member set, the key and the pause never
     disagree on chain:
     1. `setstipend '{"oracle":"<leaving member>","active":false}'` for every member being
        removed — **before** `setoracles`, which is the last moment `setstipend` accepts it. A
        dropped member's `ostip.a` row survives `setoracles` with `active true`, and `claim` only
        needs that row, so without this it keeps accruing and claiming stipend.
     2. `setpubkey '{"version":<ver+1>,…}'`
     3. `setoracles '{"oracles":[…new list…]}'`
     4. `pauserequest '{"paused":false}'`

   Approvers decode B (section 2) and compare `sha256(modulus)` with the ceremony fingerprint.
4. **Switch.** `exec` A. Watch `cleos get table orng.wax orng.wax reqs` until it is empty — a few
   seconds at today's request rate. A row that does not complete (a member is down) is `killjobs`
   material, after telling the dApp. `exec` B. From that block `config.a[activever]` is `<ver+1>`,
   `oracles.a` is the new list and `requestrand` is open again; each crash-looping member passes
   the boot check on its next restart (`bootCheck.activeVer == <ver+1>`,
   `oracleIndexMatches true`) and signs the first new request. The request pause lasts exactly
   the gap between the two `exec`s.
5. **Old processes.** Every push from a removed member now fails `"unknown oracle"`; a continuing
   member's old process skips every new request (`key_version_skipped`), and step 4 left it no
   old-`ver` row to sign. Stop them at leisure; they can do no harm.
6. **Close the old key.** `retirepubkey '{"version":<ver>}'` — right away if `reqs` was empty at
   the switch (step 4 makes it so), otherwise once the old-`ver` rows are gone.

**Without proposal A.** `exec` B alone at a quiet moment and nothing pauses. Any request still in
`reqs` at B's block carries the old `ver`. After a full replacement nobody can sign it; after a
partial one only the continuing members' old processes can, until they stop or the key is
retired. Either way plan on `killjobs` for it, and the dApp gets no result (4.4). At ~0.1
requests/s that is usually zero rows and never more than a few. A costs nothing, so keep it.

Verify: 4.1 and 4.2 read-backs; `config.a[pauserequest]` is `0`; members' `/health-check`;
`ostip.a` shows `active false` for removed members. A removed member's unpaid fee share
(`balances`) stays claimable by it — earned.

### 5.2 Key rotation, same members

Sequence 5.1 without the `setstipend` and `setoracles` steps (indices unchanged): ceremony →
every member starts its new-share process beside the old one (operator guide 6.2) → approve A
and B, where B = `setpubkey(ver+1)` + `pauserequest(false)` → `exec` A → drain → `exec` B → members
stop their old processes → `retirepubkey(ver)`.

### 5.3 Contract upgrade

Build recipe, ABI dangling-type check, hash history and the `eosio` side are in
wax-system-contracts `docs/04_guides/14_runbook-allowlisted-contract-upgrade.md`; this is the
`orng.wax` side in the producer model.

1. **Reproducible build** of the tag (runbook 14 step 1; Makefile output `build/wax.orng.wasm`
   + `.abi`). Record `sha256sum build/wax.orng.wasm` and run the ABI check. Reviewers rebuild
   independently and must get the same hash.
2. **`addornghash`** — proposal on `eosio` (`eosio@active`; in this model `$REQ`, today whatever
   `cleos get account eosio` shows): `eosio addornghash '{"hash":"<new>"}'`. Refuses
   `"hash already exists in approved list"`. Never `setornghash` here: it replaces the list and
   drops the hash the chain is running.
3. **`setcode` + `setabi`** in one transaction, signed `orng.wax@active`:
   ```bash
   cleos -u $API set contract orng.wax build wax.orng.wasm wax.orng.abi -p orng.wax@active -s -d -j > setcontract.json
   # -s -d -j: build, do not sign, do not broadcast, print JSON. Set "expiration" to the proposal window.
   cleos -u $API multisig propose_trx rng.deploy "$REQ" setcontract.json $PROPOSER -p $PROPOSER@active
   ```
   Approvers decode the `code` field and compare its sha256 with step 1 (section 2). A
   `pauserequest(true)` bracket is optional; tables survive `setcode`, but use it when the
   release notes change a row layout.
4. **Verify.** `cleos get code orng.wax` equals the listed hash; `cleos get table orng.wax
   orng.wax treasury` and `acctstate` return rows (an `invalid_type_inside_abi` error means a
   dangling ABI type — fix with `setabi` alone, the hash is unchanged); `global.b`
   `orng_code_hashes` contains the live hash. The carve-out shows up as a transfer `eosio` →
   `orng.wax` memo `treasury` in the first producer-pay fill after a member `claim` lowers
   `pool_balance` below `max_pool_rng` (`global5`); at the cap there is nothing to see.
5. **`rmornghash '{"hash":"<old>"}'`** on `eosio` (refuses `"hash not found in approved list"`).
   Leaving it listed is a standing rollback authorisation.

Rollback: redeploy the previous build while its hash is still listed; otherwise step 2 with the
old hash first.

### 5.4 Emergencies

- **Suspected compromise of two shares, or of the contract key material:** `pauserequest(true)`
  now (no new request is created under the suspect key), `killjobs` the in-flight `reqs` rows if
  you do not trust their signatures either (the dApps get no result — tell them), then 5.1 with a
  full ceremony (proposal A is already executed; B re-opens requests). Do **not** use `pause(true)` for this: it
  refuses `setpubkey` and `submitpart` (`"Contract is paused"`), so a re-key cannot run under it
  and in-flight requests can never drain. `pause(true)` is for freezing the money paths (stake,
  deposit, claim, treasury deposits are listed in 4.5). One leaked share alone cannot sign
  (2-of-3); treat it as 5.2 at normal pace.
- **A misbehaving member.** Bad full signatures suspend it by themselves after `strikesmax`
  (bad partials are screened by the combiner and never strike). There is no "suspend" action;
  `resetsuspen` only un-suspends. To exclude a member at once without a ceremony, keep the other
  members' indices: `setoracles` with the member's slot replaced by a placeholder that can never
  sign or claim — `orng.wax` itself (its authority is the producers). One `propose_trx`, in this
  order: `setstipend(<member>,false)`, `setoracles([…placeholder in its slot…])`,
  `setstipend '{"oracle":"orng.wax","active":false}'`. Two members remain and both must sign
  every request. Cost: `_reward_oracles` splits every fee across all non-suspended `oracles.a`
  rows, so the placeholder's third accrues to a `balances` row that nobody can claim (`claim`
  would transfer from `orng.wax` to itself) and that `reconcile` deducts from `pool_balance`.
  Keep this state short and follow with 5.1 promptly; the stranded third is the price of the
  immediate exclusion. Only a last-position member can be dropped by simply shortening the list;
  shortening it anywhere else shifts the survivors' `oracle_index`, the contract stamps the new
  index on their partials, and combines fail until they are re-keyed. Follow with 5.1.
  `setoracles` resets every member's strikes.
- **Stuck requests** (a `reqs` row older than a few minutes): check `parts` — one part means a
  second member is down or skipping (`key_version_skipped`); fix the member first. `killjobs` only
  when the request cannot complete (retired key, member set changed under it); the dApp gets no
  result (4.4), so tell it.
- **Two members down:** no quorum, requests queue in `reqs` and complete when a member returns;
  `pauserequest(true)` if the queue grows past what dApps tolerate.

### 5.5 Tuning

Strikes and fee: `configv2` (both at once — re-state the current fee when changing strikes).
Stipend: `configv3`; a change applies from each member's next accrual. Free-tier capacity:
`configadptive` (all seven values; read `adaptcfg` first). Unstake maturity / reward window:
`setconfig` on `unstaketime` / `oraclereward`. None of these need a pause.

## 6. State reference

```bash
T() { cleos -u $API get table orng.wax orng.wax "$1" -l 100; }
T oracles.a        # member, oracle_index, strikes, suspended
T pubkeys          # ver, exponent, modulus, retired
T config.a         # name → int64 (names decode with cleos: --lower <name> --upper <name>)
T ostip.a          # member stipend: active, last_claim, last_accrue, usd_accrued (USD × 10⁴)
T treasury         # pool_balance (base units) — the counter eosio reads
T adaptcfg         # free-tier parameters
T banlist.a        # banned dApps
T legacycb         # legacy receiverand dApps: code_hash, added_time, auto_collected
T reqs             # open requests: id, dapp, ver, parts[]  (normally a handful, seconds old)
T undelivered1     # failed deliveries awaiting retrydeliver/getresult: dapp, assoc_id, error_message
T signvals.a       # v1 signing values kept for old dApps' internal logic — read only, never erased
T balances         # members' unpaid fee shares
T stakestats       # total_stake_amount (must equal the sum of acctstate.stake)
cleos -u $API get table eosio eosio global.b | jq '.rows[0].orng_code_hashes'
cleos -u $API get table eosio eosio global5                     # rng_rate, max_pool_rng
cleos -u $API get code orng.wax
cleos -u $API get account orng.wax
```

| Table | Written by governance | Written by traffic |
|---|---|---|
| `oracles.a` | `setoracles`, `resetsuspen` | strikes / suspension on bad full signatures |
| `pubkeys` | `setpubkey`, `retirepubkey` | — |
| `config.a` | `pause`, `pauserequest`, `setconfig`, `setpubkey` (`activever`), `configv2`, `configv3`, `toggleallow`, collection actions | `requestindex` on every request |
| `ostip.a` | `setoracles`, `setstipend`, `resetsuspen` | `claim`, suspension |
| `treasury` | `reconcile` | `treasury` deposits (up), stipend claims (down) |
| `adaptcfg` | `configadptive` | — |
| `banlist.a`, `legacycb` | 4.4 actions | collection window, `skiplegacy`, `verifyhash` |
| `reqs` | `killjobs` | `requestrand`, `submitpart`, `setrand`, `markfailed` |
| `undelivered1`, `signvals.a`, `balances`, `stakestats` | — | members and dApps |

Mainnet on 2026-11-03: members `rng1.wax`, `rng2.wax`, `rng3.wax` (indices 1–3, no strikes);
one key, `ver 1`, not retired; `treasury` 600,000 WAX (= `max_pool_rng`); `allowlist 1`;
8 banned accounts; `reqs` empty between polls.

### What to watch after any change

- [ ] The table the action writes reads back the proposed value (section 4 "Verify").
- [ ] `reqs`: rows appear and disappear within seconds; no row older than a minute; no row with
      a single `part` for more than one poll.
- [ ] `oracles.a`: `strikes` unchanged, no `suspended 1`.
- [ ] Members: `/health-check` 200, `bootCheck.activeVer` = `config.a[activever]`, no
      `key_version_skipped`, no `Boot self-check FAILED` in logs (operator guide 5, 6.4).
- [ ] `config.a[paused]` and `[pauserequest]` are `0` unless you meant otherwise.
- [ ] After a deploy: `get code` = listed hash, `global.b` lists it, a table read succeeds.
- [ ] After `setoracles` / `setstipend`: `ostip.a.active` is `false` for every non-member.
- [ ] `treasury.pool_balance` ≤ `max_pool_rng` and, after `reconcile`, equal to the trace's value.
- [ ] `cleos get account orng.wax`: permissions unchanged, RAM headroom.
