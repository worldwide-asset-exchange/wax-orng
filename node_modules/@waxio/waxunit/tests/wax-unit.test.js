const {
  setupTestChain,
  randomWamAccount,
  createAccount,
  setContract,
  updateAuth,
  linkauth,
  eosjs,
  transfer,
  TESTING_PUBLIC_KEY,
  getTableRows,
  genericAction,
  dedupeTapos,
  addTime,
} = require('../');

describe('wax-unit', () => {
  let myContract;
  beforeAll(async () => {
    await setupTestChain(); // Must be called first to setup the test chain

    await createAccount('mycontract11');

    myContract = await setContract(
      'mycontract11',
      'tests/test-contract/build/testcontract.wasm',
      'tests/test-contract/build/testcontract.abi'
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

  it('should init table data', async () => {
    await myContract.loadTable('entries', {
      [myContract.account]: [
        {
          id: 1,
          entry_time: '2022-02-24T22:27:57',
        },
        {
          id: 2,
          entry_time: '2022-03-25T22:28:58',
        },
      ],
    });
    const entries = await getTableRows(
      myContract.account,
      `entries`,
      myContract.account
    );
    expect(entries.length).toEqual(2);
    expect(entries[0].id).toEqual(1);
    expect(entries[0].entry_time).toEqual('2022-02-24T22:27:57');
  });

  it('should init table data from json file', async () => {
    await myContract.loadTableFromFile('entries', 'tests/entries.json');
    const entries = await getTableRows(
      myContract.account,
      `entries`,
      'loadfile1111'
    );
    expect(entries.length).toEqual(3);
    expect(entries[0].id).toEqual(1);
    expect(entries[0].entry_time).toEqual('2022-02-24T22:26:56');
  });

  it('should call addentry action', async () => {
    await myContract.call(
      'addentry',
      [
        {
          actor: myContract.account,
          permission: 'active',
        },
      ],
      {
        id: 3,
      }
    );
    const entries = await getTableRows(
      myContract.account,
      `entries`,
      myContract.account
    );
    expect(entries.length).toEqual(3);
    expect(entries[2].id).toEqual(3);
  });

  it('can read table data', async () => {
    const balances = await getTableRows(
      'eosio.token',
      `accounts`,
      'mycontract11'
    );
    expect(balances.length).toEqual(1);
    expect(balances[0].balance).toEqual('200.00000000 WAX');
  });

  describe('addTime', () => {
    it('standard path', async () => {
      const entriesInitial = await getTableRows(
        'mycontract11',
        `entries`,
        'mycontract11'
      );
      const id = 4;

      // add new entry
      const res = await genericAction(
        'mycontract11',
        'addentry',
        {
          id,
        },
        [
          {
            actor: 'mycontract11',
            permission: 'active',
          },
        ]
      );

      let entries = await getTableRows(
        'mycontract11',
        `entries`,
        'mycontract11'
      );

      expect(entries.length).toBe(entriesInitial.length + 1);
      expect(entries[entriesInitial.length].id).toBe(id);

      await expect(
        genericAction(
          'mycontract11',
          'expireentry',
          {
            id,
            expiry_seconds: 600,
          },
          [
            {
              actor: 'mycontract11',
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrow('Entry not expired yet');

      await addTime(601, res.processed.block_time);

      await genericAction(
        'mycontract11',
        'expireentry',
        {
          id,
          expiry_seconds: 600,
        },
        [
          {
            actor: 'mycontract11',
            permission: 'active',
          },
        ]
      );

      entries = await getTableRows('mycontract11', `entries`, 'mycontract11');

      expect(entries.length).toBe(entriesInitial.length);
    });

    it('can add multiple times', async () => {
      const entriesInitial = await getTableRows(
        'mycontract11',
        `entries`,
        'mycontract11'
      );
      const id = 5;

      // add new entry
      const res = await genericAction(
        'mycontract11',
        'addentry',
        {
          id,
        },
        [
          {
            actor: 'mycontract11',
            permission: 'active',
          },
        ]
      );

      let entries = await getTableRows(
        'mycontract11',
        `entries`,
        'mycontract11'
      );

      expect(entries.length).toBe(entriesInitial.length + 1);
      expect(entries[entriesInitial.length].id).toBe(id);

      await expect(
        genericAction(
          'mycontract11',
          'expireentry',
          {
            id,
            expiry_seconds: 600,
          },
          [
            {
              actor: 'mycontract11',
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrow('Entry not expired yet');

      await addTime(300, res.processed.block_time);

      await expect(
        genericAction(
          'mycontract11',
          'expireentry',
          {
            id,
            expiry_seconds: 600,
          },
          [
            {
              actor: 'mycontract11',
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrow('Entry not expired yet');

      await addTime(301);

      await genericAction(
        'mycontract11',
        'expireentry',
        {
          id,
          expiry_seconds: 600,
        },
        [
          {
            actor: 'mycontract11',
            permission: 'active',
          },
        ]
      );

      entries = await getTableRows('mycontract11', `entries`, 'mycontract11');

      expect(entries.length).toBe(entriesInitial.length);
    });

    it('can add far into the future', async () => {
      const entriesInitial = await getTableRows(
        'mycontract11',
        `entries`,
        'mycontract11'
      );
      const id = 6;

      // add new entry
      const res = await genericAction(
        'mycontract11',
        'addentry',
        {
          id,
        },
        [
          {
            actor: 'mycontract11',
            permission: 'active',
          },
        ]
      );

      let entries = await getTableRows(
        'mycontract11',
        `entries`,
        'mycontract11'
      );

      expect(entries.length).toBe(entriesInitial.length + 1);
      expect(entries[entriesInitial.length].id).toBe(id);

      await expect(
        genericAction(
          'mycontract11',
          'expireentry',
          {
            id,
            expiry_seconds: 600,
          },
          [
            {
              actor: 'mycontract11',
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrow('Entry not expired yet');

      await addTime(600001, res.processed.block_time);

      await genericAction(
        'mycontract11',
        'expireentry',
        {
          id,
          expiry_seconds: 600,
        },
        [
          {
            actor: 'mycontract11',
            permission: 'active',
          },
        ]
      );

      entries = await getTableRows('mycontract11', `entries`, 'mycontract11');

      expect(entries.length).toBe(entriesInitial.length);
    });
  });
});
