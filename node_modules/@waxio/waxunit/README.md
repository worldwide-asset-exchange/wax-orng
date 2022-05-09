# waxunit

This unit test framework allows quick and simple unit testing capabilities for smart contracts on the wax blockchain

## Installation

```
$ npm install --save-dev @waxio/waxunit
```

## API

See the [API](./API.md)

## Usage

### Tests Setup

In the first `beforeAll` type function of your unit tests you must call `setupTestChain`. Example:

```javascript
// This is the entire API available to you
const {
  setupTestChain,
  randomWamAccount,
  sleep,
  eosjs,
  createAccount,
  setContract,
  updateAuth,
  linkauth,
  getTableRows,
  transfer,
  TESTING_PUBLIC_KEY,
  genericAction,
  dedupeTapos,
  addTime,
  getBlockHeight,
  waitTillBlock,
  getInfo,
} = require('@waxio/waxunit');

describe('my test suite', () => {
  beforeAll(async () => {
    await setupTestChain(); // Must be called first to setup the test chain

    await createAccount('mycontract11');

    await setContract(
      'mycontract11',
      'build/mycontract11.wasm',
      'build/mycontract11.abi'
    );
    await updateAuth('mycontract11', `active`, `owner`, {
      threshold: 1,
      accounts: [
        {
          permission: {
            actor: 'mycontract11',
            permission: `eosio.code`,
          },
          weight: 1,
        },
      ],
      keys: [
        {
          key: TESTING_PUBLIC_KEY,
          weight: 1,
        },
      ],
      waits: [],
    });

    await transfer(
      'eosio',
      'mycontract11',
      '200.00000000 WAX',
      `sending some test funds`
    );
  });

  it('my test case', async () => {
    const balances = await getTableRows(
      'eosio.token',
      `accounts`,
      'mycontract11'
    );
    expect(balances.length).toEqual(1);
    expect(balances[0].balance).toEqual('200.00000000 WAX');
  });
});
```

### Adding waxload action to input contract table directly

Include `waxunit.hpp` and define `WAX_LOAD_TABLE_ACTION`

```c++
#include "waxunit.hpp"

// define macro to skip waxload action
#define WAX_SKIP_HELPERS

CONTRACT example : public eosio::contract {
  ...
  public:
      // ((table_name)(struct_name)(multi_index_typedef))
      WAX_LOAD_TABLE_ACTION(
        ((entries)(entries)(entries_t))
      )
```
