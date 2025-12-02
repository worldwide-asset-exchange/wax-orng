# Migration TODO List - Grouped by Type

**File:** `tests/waxorng.test.js`
**Total Issues:** ~200+ patterns to fix
**Status:** Phase 1 - Critical Fixes in Progress

---

## 1. TYPO FIX: `blockblockchain` → `blockchain` (33 instances)

### Pattern
```javascript
// WRONG (double "block")
orngContract = await blockblockchain.createAccount(orngContract, "10000.00000000 WAX", 4565215);

// Should be:
blockchain.createAccount(...)
```

### Locations
Lines: 271, 273, 275, 277, 279, 281, 283, 287, 643, 859, 895, 934, 936, 963, 965, 1030, 1032, 1090, 1092, 1160, and more...

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```
To create an account
const newAccounts = blockchain.createAccounts('testoracle1');
      testOracle = newAccounts[0];
later make sure we init the eosio.token contract to send WAX to this account
  // Deploy eosio.token contract
    tokenContract = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
    });
   // Issue tokens to accounts
    const accountsToFund = [
      orngOracle,
      orngOracle2,
      orngOracle3,
      treasuryAccount
    ];

    await mintTokens(tokenContract, 'WAX', 8, 1000000000, 10000, accountsToFund);
  we can mint a lot token to treasuryaccount then send from this account to newly created account
// Ensure treasury has funds
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        newAccount.name.toString(),
        '500.00000000 WAX',
        'fund'
      ]).send('treasuryAccount@active');

---

## 2. CONTRACT ACCOUNT CREATION: Merge setContract/addCode into createAccount (8 contracts)

### Pattern
```javascript
// OLD qtest pattern (3 separate calls):
testToken = await blockchain.system.createAccount(testToken, "10000.00000000 WAX", 4565215);
await testToken.setContract({
  abi: './tests/contracts/eosio.token.abi',
  wasm: './tests/contracts/eosio.token.wasm',
});
await testToken.addCode('active');

// NEW vert pattern (1 call):
testToken = blockchain.createAccount({
  name: Name.from('eosio.token'),
  wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
  abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
  enableInline: true,
});
```

### Contracts to Fix
1. **testToken** (lines 285, 290-295) - eosio.token contract
2. **orngContract** (lines 271, 297-302) - wax.orng contract
3. **dappContract** (lines 283, 304-309) - randreceiver contract
4. **delphiAccount** (lines 287, 311-317) - delphioracle contract
5. **dappTest11** (lines 645, 650-653) - randreceiver contract
6. **dappTest12** (lines 647, 654-657) - randreceiver contract
7. **dappTest13** (lines 649, 658-661) - randreceiver contract
8. **failingDappAcc** (lines 2758, 2762-2767) - randreceiver contract

### Note
- Need to add `const fs = require('fs');` at the top if not already present
- `enableInline: true` replaces `addCode('active')`
- Paths stay the same but wrapped in `fs.readFileSync()`
- ABI files need `'utf8'` encoding parameter

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```

---

## 3. OLD ACTION PATTERN: .contract.action.* → .actions.* (44 instances)

### Pattern
```javascript
// OLD qtest pattern:
await orngContract.contract.action.setconfig(
  { param1: value1, param2: value2 },
  getActivePermission([orngContract.name])
);

// NEW vert pattern:
await orngContract.actions.setconfig([
  value1,
  value2
]).send('orng.wax@active');
```

### Breakdown by Action Type

#### A. Configuration Actions (4 instances)
- Line 399: `orngContract.contract.action.setconfig`
- Line 444: `orngContract.contract.action.configadptive`

#### B. Oracle Key Management (4 instances)
- Lines 529, 551, 573, 595: `orngContract.contract.action.setpubkey`

#### C. Token Transfers (2 instances)
- Lines 682, 829: `testToken.contract.action.transfer`

#### D. Staking Actions (4 instances)
- Line 1118: `orngContract.contract.action.claimfund`
- Lines 1144, 1175, 1220: `orngContract.contract.action.accumstake`

#### E. Random Number Requests (4 instances)
- Lines 1362, 1410, 1504, 1533: `orngContract.contract.action.requestrand`

#### F. Oracle Submissions (26+ instances)
- Lines 1637, 1658, 1694, 1716, and many more: `orngContract.contract.action.submitpart`
- Many more submitpart, setrand, and other oracle operations

### Key Conversion Rules
1. Object parameters `{param: value}` → Array parameters `[value]`
2. Permission array `getActivePermission([account.name])` → String `'account@active'`
3. Account names need `.toString()` where used
4. Method chain: `.actions.name([params]).send('auth')`

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```

---

## 4. OLD TABLE QUERY PATTERN: .contract.table[].get() → .tables[]().getTableRows() (1 instance)

### Pattern
```javascript
// OLD qtest pattern:
pubkeyTable = await orngContract.contract.table['pubkeys'].get({
  scope: orngContract.name,
  lower_bound: keyVersion,
  upper_bound: keyVersion,
  limit: 1,
});

// NEW vert pattern:
const pubkeyTable_rows = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
  .getTableRows();
// Then filter by key if needed, or use getTableRow(key) for single row
```

### Location
- Line 2923: `orngContract.contract.table['pubkeys'].get`

### Notes
- Need `nameToBigInt()` for scope parameter
- `getTableRows()` returns array, `getTableRow(key)` returns single row
- Filtering (lower_bound, upper_bound) may need to be done in JS after retrieval

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```

---

## 5. ERROR TEST PATTERN: .rejects.toThrowError() → expectToThrow() (5 instances)

### Pattern
```javascript
// OLD qtest pattern:
await expect(
  orngContract.actions.requestrand([...])
).rejects.toThrowError(`WAX RNG: ${dappContract3.name}`);

// NEW vert pattern:
await expectToThrow(
  orngContract.actions.requestrand([...]),
  `WAX RNG: ${dappContract3.name.toString()}`
);
```

### Locations
- Line 1374: Error test for dappContract3
- Line 1422: Error test for dappContract4
- Line 2677: Missing authority test
- Line 2691: Missing authority test
- Line 2873: Missing authority test for govAccount

### Notes
- `expectToThrow` is imported from `@vaulta/vert`
- Error message parameter is second argument
- Account names need `.toString()` in error messages

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```

---

## 6. TRANSFER SHORTHAND: account.transfer() → tokenContract.actions.transfer() (69 instances)

### Pattern
```javascript
// OLD qtest shorthand:
await treasuryAccount.transfer(orngContract.name, '0.04500000 WAX', 'treasury');

// NEW vert full syntax:
await testToken.actions.transfer([
  treasuryAccount.name.toString(),
  orngContract.name.toString(),
  '0.04500000 WAX',
  'treasury'
]).send('treasury1@active');
```

### Major Locations (with TODO comments)
- Line 667: treasuryAccount.transfer (treasury deposit)
- Line 710: dappTest11.transfer (deposit for dapp)
- Line 847: dappContract.transfer (stake for dapp)
- Line 864: dstake2.transfer (1000 WAX stake)
- Line 876: dstake2.transfer (0.00000001 WAX stake)
- Line 900: dstake3.transfer (1000 WAX stake)
- Line 942: staker.transfer (50 WAX third-party stake)
- Line 971: staker.transfer (30 WAX stake)
- Line 980: staker.transfer (20 WAX stake)
- Lines 1035, 1095, 1163, 1203: More stake operations
- Lines 1236-1320: Multiple deposit and stake operations
- Lines 1380-2700: Many more throughout tests

### Also: Transfers inside expectToThrow (15+ instances)
- Lines 757-820: Invalid memo patterns (UPPERCASE, special chars, empty, too long, nonexistent)

### Notes
- First parameter: sender account name (`.toString()`)
- Second parameter: recipient account name (`.toString()`)
- Third parameter: amount string (unchanged)
- Fourth parameter: memo string (unchanged, may have concatenation)
- `.send()` auth is sender account with @active

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```

---

## 7. ACCOUNT CREATION: blockchain.system.createAccount() needs fixing (5 instances)

### Pattern
```javascript
// OLD pattern:
testToken = await blockchain.system.createAccount(testToken, "10000.00000000 WAX", 4565215);

// NEW pattern (for regular accounts):
testToken = blockchain.createAccount({ name: Name.from('eosio.token') });

// OR (if funding needed):
// Use blockchain.createAccounts() for multiple accounts
// Then transfer tokens separately using token contract
```

### Locations
- Line 265: `blockchain.system.createAccounts` (array)
- Line 285: testToken creation
- Lines 645, 647, 649: dappTest11, dappTest12, dappTest13
- Line 2758: failingDappAcc

### Notes
- These are separate from the contract accounts in section #2
- `blockchain.system.*` is qtest pattern
- Vert uses `blockchain.createAccount()` or `blockchain.createAccounts()`
- Initial funding should be done via token contract transfers, not in createAccount

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```

---

## 8. ADDITIONAL TODO COMMENTS (79 total)

Many TODO comments throughout the file marking:
- Transfer shorthand conversions
- Account grouping suggestions
- Manual review needed markers

### Breakdown
- "Convert transfer shorthand": 28 comments
- "Consider grouping with blockchain.createAccounts()": 33 comments
- "Convert to blockchain.createAccount with wasm/abi": 5 comments
- "Replace addCode with enableInline": 5 comments
- Other manual review markers: 8 comments

### Instructions (USER TO PROVIDE):
```
[Add your fix instructions here]
```

---

## Priority Order (Recommended)

### Phase 1: Critical Fixes (Required for tests to run)
1. ✅ Fix delphioracle init (COMPLETED - using table.set pattern)
2. Fix typo: blockblockchain → blockchain (33 instances)
3. Fix contract account creation (8 contracts)
4. Fix old action patterns (44 instances)
5. Fix old table query pattern (1 instance)
6. Fix error test patterns (5 instances)

### Phase 2: High Priority (Important for correctness)
7. Fix transfer shorthand (69 instances)
8. Fix blockchain.system.createAccount (5 instances)

### Phase 3: Cleanup
9. Remove all TODO comments
10. Test and verify all changes

---

## Search Commands

```bash
# Find specific patterns
grep -n "blockblockchain" tests/waxorng.test.js
grep -n "\.contract\.action\." tests/waxorng.test.js
grep -n "\.contract\.table" tests/waxorng.test.js
grep -n "\.rejects\.toThrow" tests/waxorng.test.js
grep -n "\.setContract(" tests/waxorng.test.js
grep -n "\.addCode(" tests/waxorng.test.js
grep -n "blockchain\.system\." tests/waxorng.test.js
grep -n "\.transfer(" tests/waxorng.test.js | grep -v "actions\.transfer"

# Count occurrences
grep -c "blockblockchain" tests/waxorng.test.js
grep -c "\.contract\.action\." tests/waxorng.test.js
grep -c "TODO" tests/waxorng.test.js
```

---

## Notes

- Reference file: `tests/stipend.test.js` (fully migrated vert example)
- Backup file: `tests/waxorng.test.js.qtest-backup` (original qtest version)
- Documentation: `docs/TESTING-MIGRATION-GUIDE.md`
