# Migration TODO List - Prioritized Manual Fixes

**File:** `tests/waxorng.test.js`
**Total TODOs:** 81
**Automated:** ~70% complete
**Manual Work:** ~30% remaining

---

## 🔴 CRITICAL PRIORITY (Must Fix for Tests to Run)

### 1. Complex Action Calls (2 items) - Lines with nested objects

These are action calls with complex nested objects or arrays that couldn't be auto-converted.

**Search for:** `// TODO: MANUAL REVIEW NEEDED - Complex action call`

**Pattern:**
```javascript
// Before (complex object)
await contract.contract.action.name({
  nested: { objects },
  arrays: [...]
}, permissions)

// After (vert format)
await contract.actions.name([
  param1,
  param2,
  nested_value
]).send('account@active')
```

**Action Items:**
- [ ] Find each complex action call
- [ ] Manually extract nested values into flat array
- [ ] Ensure parameter order matches action signature
- [ ] Replace permission object with string format

---

### 2. Contract Account Creation (5 items) - Must merge setContract/addCode

Contract accounts that currently use separate `createAccount()` + `setContract()` + `addCode()` calls.

**Search for:** `// TODO: MANUAL REVIEW - Convert to blockchain.createAccount with wasm/abi`

**Pattern:**
```javascript
// Before (qtest pattern)
contract = await blockchain.system.createAccount('name', '1000 WAX', 4565215);
await contract.setContract({
  abi: './build/contract.abi',
  wasm: './build/contract.wasm',
});
await contract.addCode('active');

// After (vert pattern)
contract = blockchain.createAccount({
  name: Name.from('name'),
  wasm: fs.readFileSync('./build/contract.wasm'),
  abi: fs.readFileSync('./build/contract.abi', 'utf8'),
  enableInline: true,
});
```

**Known Contract Accounts to Fix:**
1. `orngContract` - Main ORNG contract
2. `testToken` - Token contract
3. `dappContract` - Test dApp contract
4. `delphiAccount` - Delphi oracle contract
5. Other test contracts as they appear

**Action Items:**
- [ ] Find each contract account creation
- [ ] Merge the three separate calls into one `createAccount()` with wasm/abi
- [ ] Remove the old `setContract()` and `addCode()` calls
- [ ] Change `abi:` and `wasm:` from paths to `fs.readFileSync()`
- [ ] Add `enableInline: true` to replace `addCode()`

---

### 3. Remaining Old Patterns (46 action calls + 1 table query)

The validation found patterns that weren't fully converted.

**Action Items:**
- [ ] Search for remaining `.contract.action.` patterns (46 instances)
- [ ] Search for remaining `.contract.table[` patterns (1 instance)
- [ ] Convert each to vert format manually

---

## 🟡 HIGH PRIORITY (Important for Clean Code)

### 4. Transfer Operations (28 items) - Shorthand to Full Syntax

Token transfer calls using the shorthand `account.transfer()` syntax.

**Search for:** `// TODO: MANUAL REVIEW - Convert transfer shorthand`

**Pattern:**
```javascript
// Before (qtest shorthand)
await account.transfer(recipient, '1.00000000 WAX', 'memo')

// After (vert full syntax)
await tokenContract.actions.transfer([
  account.name.toString(),
  recipient,
  '1.00000000 WAX',
  'memo'
]).send('account@active')
```

**Note:** You need to know which `tokenContract` variable to use (likely `chain.system` or a specific token contract variable).

**Action Items:**
- [ ] Find each transfer shorthand call
- [ ] Identify the sender account variable
- [ ] Identify the token contract (usually eosio.token or a test token)
- [ ] Convert to full `tokenContract.actions.transfer()` syntax
- [ ] Ensure sender account name uses `.toString()`

---

### 5. Other Manual Review Items (6 items)

Various patterns that couldn't be auto-converted.

**Search for:** `// TODO: MANUAL REVIEW - Could not auto-convert`

**Action Items:**
- [ ] Review each item individually
- [ ] Determine why auto-conversion failed
- [ ] Manually convert to vert format

---

## 🟢 MEDIUM PRIORITY (Code Organization)

### 6. Account Creation Grouping (33 items) - Optional Optimization

Regular (non-contract) accounts that could be grouped into a single `blockchain.createAccounts()` call for cleaner code.

**Search for:** `// TODO: Consider grouping with blockchain.createAccounts()`

**Pattern:**
```javascript
// Before (individual creates)
acc1 = blockchain.createAccount({ name: Name.from('acc1') });
acc2 = blockchain.createAccount({ name: Name.from('acc2') });
acc3 = blockchain.createAccount({ name: Name.from('acc3') });

// After (grouped - more efficient)
const accounts = blockchain.createAccounts('acc1', 'acc2', 'acc3');
acc1 = accounts[0];
acc2 = accounts[1];
acc3 = accounts[2];
```

**Action Items:**
- [ ] Group related account creations (optional, for cleaner code)
- [ ] Or leave as-is if you prefer explicit individual creation

---

### 7. setContract/addCode Comments (1 item)

**Search for:** `// TODO: MANUAL REVIEW - Merge setContract into createAccount`

This is related to item #2 above. These comments mark the `setContract()` and `addCode()` lines that should be merged.

**Action Items:**
- [ ] Remove these lines after merging into `createAccount()` (from item #2)

---

## 🔵 LOW PRIORITY (Suggestions)

### 8. Token Create/Issue Pattern (1 item)

Suggestion to use `mintTokens()` helper instead of manual create/issue.

**Search for:** `// TODO: MANUAL REVIEW - Consider replacing token create/issue with mintTokens()`

**Pattern:**
```javascript
// Before (manual)
await testToken.contract.action.create(...);
await testToken.contract.action.issue(...);

// After (helper - simpler)
await mintTokens(tokenContract, 'WAX', 8, 1000000000, 10000, [accounts]);
```

**Action Items:**
- [ ] Optionally replace token setup with `mintTokens()` helper
- [ ] Or leave as-is if you prefer explicit control

---

## 📋 Execution Strategy

### Phase 1: Critical Fixes (Required for tests to run)
```bash
# 1. Fix complex action calls (2 items)
#    Search: "MANUAL REVIEW NEEDED - Complex action call"

# 2. Fix contract account creation (5 items)
#    Search: "Convert to blockchain.createAccount with wasm/abi"
#    Merge setContract + addCode into createAccount()

# 3. Find and fix remaining old patterns
#    Search: ".contract.action." (46 instances)
#    Search: ".contract.table[" (1 instance)

# 4. Test after Phase 1
npm run test:waxorng-vert -- --grep "Initialize"
```

### Phase 2: High Priority Fixes (Important)
```bash
# 5. Fix transfer operations (28 items)
#    Search: "Convert transfer shorthand"

# 6. Fix other manual review items (6 items)
#    Search: "Could not auto-convert"

# 7. Test after Phase 2
npm run test:waxorng-vert -- --grep "test setconfig"
```

### Phase 3: Medium Priority (Optional Cleanup)
```bash
# 8. Group account creations (33 items - optional)
#    Search: "Consider grouping"

# 9. Test after Phase 3
npm run test:waxorng-vert
```

### Phase 4: Low Priority (Nice to Have)
```bash
# 10. Use mintTokens() helper (1 item - optional)
#     Search: "Consider replacing token create/issue"
```

---

## 🔧 Quick Reference Commands

### Find Specific TODO Categories
```bash
# Complex action calls (CRITICAL)
grep -n "MANUAL REVIEW NEEDED - Complex action call" tests/waxorng.test.js

# Contract accounts (CRITICAL)
grep -n "Convert to blockchain.createAccount with wasm/abi" tests/waxorng.test.js

# Transfer operations (HIGH)
grep -n "Convert transfer shorthand" tests/waxorng.test.js

# Account grouping (MEDIUM)
grep -n "Consider grouping" tests/waxorng.test.js

# All TODOs
grep -n "// TODO" tests/waxorng.test.js
```

### Find Remaining Old Patterns
```bash
# Old action pattern (should be 0 after fixes)
grep -n "\.contract\.action\." tests/waxorng.test.js | wc -l

# Old table pattern (should be 0 after fixes)
grep -n "\.contract\.table\[" tests/waxorng.test.js | wc -l

# Old error pattern (should be 0 after fixes)
grep -n "\.rejects\.toThrow" tests/waxorng.test.js | wc -l
```

### Test Specific Suites
```bash
# Test basic setup
npm run test:waxorng-vert -- --grep "Initialize"

# Test configuration
npm run test:waxorng-vert -- --grep "test setconfig"

# Test staking
npm run test:waxorng-vert -- --grep "test stake"

# Full test (after all fixes)
npm run test:waxorng-vert
```

---

## 📊 Progress Tracking

### Current Status
- ✅ Automated migration: 70% complete
- ⏳ Manual fixes: 0% complete (81 items remaining)
- ❌ Tests: Not yet passing

### Completion Checklist
- [ ] Phase 1: Critical fixes (7 items + old patterns)
- [ ] Phase 2: High priority (34 items)
- [ ] Phase 3: Medium priority (33 items)
- [ ] Phase 4: Low priority (1 item)
- [ ] All tests passing
- [ ] Remove all TODO comments
- [ ] Validation passes without errors

---

## 💡 Tips

1. **Start small**: Fix one or two items, then test
2. **Use grep**: Find similar patterns and fix them together
3. **Test incrementally**: Don't wait until everything is fixed
4. **Keep backup**: Original file is in `tests/waxorng.test.js.qtest-backup`
5. **Use validation**: Run `python scripts/migrate/12_validate_migration.py` after fixes
6. **Compare**: Run both qtest and vert versions to compare behavior

---

## 🆘 Need Help?

If you get stuck:
1. Check `docs/TESTING-MIGRATION-GUIDE.md` for examples
2. Look at `tests/stipend.test.js` for reference vert patterns
3. Check `tests/callback_test.test.js` for more examples
4. Revert to backup if needed: `cp tests/waxorng.test.js.qtest-backup tests/waxorng.test.js`
