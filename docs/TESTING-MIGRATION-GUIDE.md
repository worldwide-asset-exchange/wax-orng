# Testing Framework Migration Guide: qtest-js → @vaulta/vert

This guide documents the migration from qtest-js (Jest) to @vaulta/vert (Mocha/Chai) testing framework for the WAX ORNG project.

## Overview

**From:** qtest-js with Jest testing framework
**To:** @vaulta/vert with Mocha/Chai testing framework

## Framework Comparison

| Feature | qtest-js (Jest) | @vaulta/vert (Mocha/Chai) |
|---------|-----------------|---------------------------|
| **Imports** | `require('qtest-js')` | `require('@vaulta/vert')` + `require('chai')` |
| **Blockchain** | `Chain.setupChain('WAX')` | `new Blockchain()` |
| **Accounts** | String names → Objects | Objects from creation |
| **Account Creation** | `chain.system.createAccount()` | `blockchain.createAccounts()` |
| **Contract Deploy** | `setContract()` then `addCode()` | Combined in `createAccount()` |
| **Action Calls** | `contract.action.name(params, perms)` | `actions.name(array).send('acc@perm')` |
| **Table Query** | `contract.table['name'].get()` | `tables['name'](scope).getTableRow()` |
| **Name Conversion** | Direct string | `nameToBigInt()` for tables |
| **Time Control** | Not exposed | `blockchain.addTime(seconds(n))` |
| **Assertions** | Jest `expect().toBe()` | Chai `expect().to.equal()` |
| **Error Testing** | `rejects.toThrow()` | `expectToThrow()` helper |
| **Lifecycle** | `beforeAll/afterAll` | `before/after` |

## 1. Imports

### Before (qtest-js)
```javascript
const { Chain, Account } = require('qtest-js');
const crypto = require('crypto');
const fs = require('fs');
```

### After (@vaulta/vert)
```javascript
const vert = require('@vaulta/vert');
const { Blockchain, nameToBigInt, expectToThrow, mintTokens } = vert;
const { assert, expect } = require('chai');
const crypto = require('crypto');
const fs = require('fs');
const { Name, Int64 } = require("@wharfkit/antelope");
```

## 2. Test Lifecycle

### Before (qtest-js + Jest)
```javascript
beforeAll(async () => {
  jest.setTimeout(20000);
  chain = await Chain.setupChain('WAX');
  // setup code
});

afterAll(async () => {
  await chain.clear();
}, 10000);
```

### After (@vaulta/vert + Mocha)
```javascript
before(async () => {
  blockchain = new Blockchain();
  // setup code
});

after(async () => {
  // Cleanup if needed
});
```

## 3. Blockchain Initialization

### Before (qtest-js)
```javascript
let chain;
let orngContract = 'orng.wax';  // String

beforeAll(async () => {
  chain = await Chain.setupChain('WAX');
});
```

### After (@vaulta/vert)
```javascript
let blockchain;
let orngContract;  // Object

before(async () => {
  blockchain = new Blockchain();
});
```

## 4. Account Creation

### Before (qtest-js)
```javascript
// Single account with balance and RAM
orngContract = await chain.system.createAccount(
  orngContract,
  "10000.00000000 WAX",
  4565215
);

// Multiple accounts
[pauseAcc, payee, payer] = await chain.system.createAccounts(
  [pauseAcc, payee, payer],
  '10000.00000000 WAX'
);
```

### After (@vaulta/vert)
```javascript
// Multiple regular accounts (no contract)
const accounts = blockchain.createAccounts(
  'oracle.wax',
  'oracle2.wax',
  'treasury1'
);
orngOracle = accounts[0];
orngOracle2 = accounts[1];
treasuryAccount = accounts[2];

// Contract account with WASM/ABI
orngContract = blockchain.createAccount({
  name: Name.from('orng.wax'),
  wasm: fs.readFileSync('./build/wax.orng.wasm'),
  abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
  enableInline: true,  // Replaces addCode('active')
});
```

## 5. Contract Deployment

### Before (qtest-js)
```javascript
await orngContract.setContract({
  abi: './build/wax.orng.abi',
  wasm: './build/wax.orng.wasm',
});

await orngContract.addCode('active');
```

### After (@vaulta/vert)
```javascript
// Contract deployed during account creation
orngContract = blockchain.createAccount({
  name: Name.from('orng.wax'),
  wasm: fs.readFileSync('./build/wax.orng.wasm'),
  abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
  enableInline: true,
});

// To update contract later
await dappV1.setContract({
  wasm: './tests/contracts/randreceiverv3.wasm',
  abi: './tests/contracts/randreceiverv3.abi',
});
```

## 6. Action Calls

### Before (qtest-js)
```javascript
await orngContract.contract.action.setpubkey(
  {
    version: 1,
    exponent: exponent0,
    modulus: modulus0,
  },
  [
    {
      actor: govAccount.name,
      permission: 'active',
    },
  ]
);
```

### After (@vaulta/vert)
```javascript
await orngContract.actions.setpubkey([
  1,
  exponent0,
  modulus0
]).send('orng.wax@active');

// Note: Parameters as ARRAY, not object
// Permission as STRING in format 'account@permission'
```

### Parameter Conversion Rules

**Object → Array**: Parameters must match action signature order

```javascript
// Before: { version: 1, exponent: 'x', modulus: 'm' }
// After:  [1, 'x', 'm']

// Before: { assoc_id: 100, signing_value: 999, caller: 'dapp.wax' }
// After:  [100, 999, 'dapp.wax']
```

## 7. Table Queries

### Before (qtest-js)
```javascript
const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
  scope: orngContract.name,
});

const configTable = await orngContract.contract.table['config.a'].get({
  scope: orngContract.name,
  lower_bound: 'feepercall',
  upper_bound: 'feepercall',
});

// Access rows
pubkey_tbl.rows[0].ver
pubkey_tbl.rows.length
```

### After (@vaulta/vert)
```javascript
// Get all rows
const pubkey_rows = orngContract.tables['pubkeys'](
  nameToBigInt('orng.wax')
).getTableRows();

// Get single row
const configRow = orngContract.tables['config.a'](
  nameToBigInt('orng.wax')
).getTableRow(nameToBigInt('feepercall'));

// Access rows
pubkey_rows[0].ver
pubkey_rows.length
```

## 8. Account Name References

### Before (qtest-js)
```javascript
orngOracle.name      // Direct string
dappContract.name    // 'dapp.wax'
```

### After (@vaulta/vert)
```javascript
orngOracle.name.toString()      // Must convert
dappContract.name.toString()    // 'dapp.wax'

// For table queries
nameToBigInt('oracle.wax')
nameToBigInt(orngOracle.name.toString())
```

## 9. Assertions

### Before (qtest-js / Jest)
```javascript
expect(value).toBe(1);
expect(value).toEqual(expected);
expect(array.length).toBe(0);
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeGreaterThan(10);
expect(value).toBeLessThan(100);
```

### After (@vaulta/vert / Chai)
```javascript
expect(value).to.equal(1);
expect(value).to.equal(expected);
expect(array.length).to.equal(0);
expect(value).to.be.true;
expect(value).to.be.false;
expect(value).to.be.above(10);
expect(value).to.be.below(100);
expect(value).to.be.at.least(10);
expect(value).to.be.at.most(100);
expect(obj).to.exist;
expect(obj).to.be.undefined;
```

## 10. Error Testing

### Before (qtest-js / Jest)
```javascript
await expect(
  orngContract.contract.action.setconfig(
    { config: 'test', value: 999 },
    [{ actor: 'dapp.wax', permission: 'active' }]
  )
).rejects.toThrowError('missing authority');

await expect(
  dappContract.transfer(orngContract.name, '1 WAX', 'stake')
).rejects.toThrow('error message');
```

### After (@vaulta/vert / Chai)
```javascript
await expectToThrow(
  orngContract.actions.setconfig([
    'test',
    999
  ]).send('dapp.wax@active'),
  'missing authority'
);

await expectToThrow(
  tokenContract.actions.transfer([
    'from',
    'to',
    '1.00000000 WAX',
    'stake'
  ]).send('from@active'),
  'error message'
);
```

## 11. Token Operations

### Before (qtest-js)
```javascript
// Create and issue
await testToken.contract.action.create({
  issuer: testToken.name,
  maximum_supply: "1000.0000 TST",
}, [{ actor: testToken.name, permission: 'active' }]);

await testToken.contract.action.issue({
  to: testToken.name,
  quantity: "1000.0000 TST",
  memo: "issue",
}, [{ actor: testToken.name, permission: 'active' }]);

// Transfer
await dappContract.transfer(
  orngContract.name,
  '1.00000000 WAX',
  'stake'
);
```

### After (@vaulta/vert)
```javascript
// Use built-in helper
await mintTokens(
  tokenContract,
  'WAX',              // Symbol
  8,                  // Precision
  1000000000,         // Max supply
  10000,              // Amount per account
  [account1, account2]  // Accounts to fund
);

// Transfer
await tokenContract.actions.transfer([
  dappContract.name.toString(),
  orngContract.name.toString(),
  '1.00000000 WAX',
  'stake'
]).send('dapp.wax@active');
```

## 12. Time Manipulation

### Before (qtest-js)
```javascript
// Not available in qtest-js
// Time progresses with blocks
```

### After (@vaulta/vert)
```javascript
// Helper function
function seconds(s) {
  return {
    toMilliseconds: () => s * 1000
  };
}

// Advance time
blockchain.addTime(seconds(30));    // 30 seconds
blockchain.addTime(seconds(3600));  // 1 hour
```

## 13. Helper Functions for vert

Add these helper functions to your test file:

```javascript
// Time helper
function seconds(s) {
  return {
    toMilliseconds: () => s * 1000
  };
}

// Balance helper
function getBalance(tokenContract, accountName) {
  try {
    const row = tokenContract.tables.accounts(nameToBigInt(accountName))
      .getTableRow(nameToBigInt('WAX'));
    if (row && row.balance) {
      return { amount: parseFloat(row.balance.split(' ')[0]) };
    }
  } catch (e) {
    // Account may not have balance row yet
  }
  return { amount: 0 };
}

// Name conversion helper
function stringToName(str) {
  const charToSymbol = (c) => {
    if (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) {
      return c - 'a'.charCodeAt(0) + 6;
    }
    if (c >= '1'.charCodeAt(0) && c <= '5'.charCodeAt(0)) {
      return c - '1'.charCodeAt(0) + 1;
    }
    if (c === '.'.charCodeAt(0)) {
      return 0;
    }
    return 0;
  };

  let name = BigInt(0);
  const len = Math.min(str.length, 12);

  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    if (i < 12) {
      name |= BigInt(charToSymbol(c) & 0x1f) << BigInt(64 - 5 * (i + 1));
    }
  }

  return name.toString();
}
```

## 14. Common Pitfalls

### ❌ Name Type Mismatches
```javascript
// WRONG
[orngOracle.name, orngOracle2.name]

// CORRECT
[orngOracle.name.toString(), orngOracle2.name.toString()]
```

### ❌ Action Parameters as Objects
```javascript
// WRONG
await orngContract.actions.setpubkey({
  version: 1,
  exponent: 'x',
  modulus: 'm'
}).send('orng.wax@active');

// CORRECT
await orngContract.actions.setpubkey([
  1,
  'x',
  'm'
]).send('orng.wax@active');
```

### ❌ Table Scope Without nameToBigInt
```javascript
// WRONG
orngContract.tables['config.a']('orng.wax').getTableRows();

// CORRECT
orngContract.tables['config.a'](nameToBigInt('orng.wax')).getTableRows();
```

### ❌ Jest Assertions in Chai
```javascript
// WRONG
expect(value).toBe(1);

// CORRECT
expect(value).to.equal(1);
```

## 15. Migration Checklist

- [ ] Update imports (qtest-js → vert + chai + wharfkit)
- [ ] Change `beforeAll` → `before`, `afterAll` → `after`
- [ ] Replace `Chain.setupChain()` → `new Blockchain()`
- [ ] Update account creation patterns
- [ ] Convert contract deployment (merge setContract + addCode)
- [ ] Transform action calls (object params → arrays)
- [ ] Add `.send('account@permission')` to all actions
- [ ] Update table queries with `nameToBigInt()`
- [ ] Add `.toString()` to account name references
- [ ] Convert Jest assertions to Chai syntax
- [ ] Replace `rejects.toThrow()` with `expectToThrow()`
- [ ] Add helper functions (seconds, getBalance, stringToName)
- [ ] Update token operations to use `mintTokens()`
- [ ] Add time manipulation where needed
- [ ] Remove `jest.setTimeout()` calls
- [ ] Remove `await chain.clear()` calls

## 16. Testing the Migration

```bash
# Test specific suite
npm run test:waxorng-vert -- --grep "Initialize"

# Test full file
npm run test:waxorng-vert

# Compare with original
npm run test:waxorng-qtest
```

## 17. References

- vert Documentation: https://github.com/vaulta/vert
- Chai Assertions: https://www.chaijs.com/api/bdd/
- @wharfkit/antelope: https://wharfkit.com/
- Mocha Test Framework: https://mochajs.org/
