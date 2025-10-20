const { Chain, Account } = require('qtest-js');

const crypto = require('crypto');
const fs = require('fs');
const { RSASigning, make_msg } = require('./rsaSigning.js');

function stringHashToNum(str) {
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    let bytes = str.slice(i * 2, i * 2 + 2);
    const a = parseInt(bytes, 16) & 127;
    result = (result << BigInt(8)) + BigInt(a);
  }
  return result.toString();
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function stringToName(str) {
  // Convert string to EOSIO name (uint64_t)
  // EOSIO names use base32 encoding with characters .12345abcdefghijklmnopqrstuvwxyz
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

describe('test orng callback allowlist', () => {
  let chain;
  let systemContract = 'eosio';
  let orngContract = 'orng.wax';
  let govAccount = 'orng.wax';
  let orngOracle = 'oracle.wax';
  let orngOracle2 = 'oracle2.wax';
  let orngOracle3 = 'oracle3.wax';
  let orngOracle4 = 'oracle4.wax';
  let dappContract = 'dapp.wax';
  let legacyDapp1 = 'legacy1.wax';
  let legacyDapp2 = 'legacy2.wax';
  let newDapp = 'newdapp.wax';
  let testToken = 'testtoken';

  const exponent0 = '10001';
  const modulus0 =
    'c61c159689a0bddad3b3855e29f996c91d358f8735d653272565957f9b184f4312b6fe1604adacbcbc9af99a8a9cebfeabd3e93fff3b1e5c7e7a95567e1671dd2b09e868dc54763cd3ecac29d0cb1bcf2a5b4ad39455f273a0d91c4adba1ddf8a79e49f9ca48b6c3f8a2280702317c213548d0ee24c2ec2a0fb8ff31196601cb988316dd0bb7830f8702a216e8369167c0a7a22336232a2291a26f1f2811a2ed81e02da627e07315c89ae376f3a7112b73c8661ab64411c99cdc80b77ce373edfd5e17a44a737e4321db373bcf87091ad02a64a09be58b7ad4d8610b58b018bc6c5136150746f2b7d0a83f2832caaafb2b9f30b5e978fe27974d36d2e9334b0eb7c739bda9e212e413ab8b05f4f42ab2d0447b2b152ae02901a3c755bc44ae494f3ee094643c6cc44f0e5a1d7e4220abb62ee595576e94c27e299fe7cb0568b11d638b7a4a8f332c626d704f3d38bf3ae7c2c9f265bac26611df6a7988b15bc8d743bac8f98d6de8fc68d3b6a46a563ffff4f3b58f90fea9fc96223bcf022083562fa69c810641f8d9d4e6ed9e4cfad24f2424d5cbaef058d8fbbd2b44ce59b5f1f2a5ca89f4c0801da6c816611fc6131e9741471bb49bdec6a78ab0559fa4b324f538ad34a0c1ac74a8fee99a7f73b0564312f3473ccd78354b15211d8d8136c31dd2ab1a566c95bcbf2c6e1c1870cb79562e9a9d5e7cabf96e45f37ac3e9c1';
  const privateKey0 = fs.readFileSync('./tests/resources/test_rsa_4096_priv_0.pem', 'utf8');
  const modulus0Id = stringHashToNum(crypto.createHash('sha256').update(modulus0).digest('hex'));

  const exponent1 = '10001';
  const modulus1 =
    'b67b5732be0888309dfba35e310eee09641a3f609ec94fdfb45aeaec1231e08268f2a065fffb00aa41eaec560af2bedc0d48cd647b89a8a44b4e0a5fef365640ad379d05112e063467f973c0053657534b1c76cbed8aae705d3453b1581b6badbff41ea2ff5a84e84b06e4293978f7d5389180803f5b27c13290f209c647ee0a8de4184d39f6d4e66a01ffd13ac0740a997b9e05023a51b9c281485685c0cfe3743dbc788cc3aac31c2f35a53414ff236ed2a998aa3617f3bda2f6163aa5254cf60f7d73b4d553b1d2fbd057299a297832cd9e8d2a1786b4260188889e9f7dd713dc1c22c6dda8e001ed76114e41529caa575ff6bc54a79d7ed6f6442b9fe84712ec2bae06560eb3fe40292143f69ae67e72ef7a010d95879df4edfb0ed74a2a7b9aeaade0c02a73a9a27c710dba0020891a9585cae9b6937f82c56c20017107990101a86c71b6c759abc5be23eb790c795e138363c40c29c8ec0fae65ad1de30bd2a5b0bbedc633caf21a8eae0d5afced68fb1a2a1cf5a175d5207ffcfad69de17cb839ab82f6ac1833fbe641eb869be9d9cd5e742bd79b7472eed3d39956c4b5eb9578cf92ba9202ddab1b0f81dc05c85380fb85a67adc88ae295de66cdc2977c2f6273acd65f234684cb9b5e60ab75cb6f433eb12961afe295247d7819d5ba4213d4902039234506f5109534734e65c28e2a8078afc3b59b92e7f329f791b';
  const privateKey1 = fs.readFileSync('./tests/resources/test_rsa_4096_priv_1.pem', 'utf8');
  const modulus1Id = stringHashToNum(crypto.createHash('sha256').update(modulus1).digest('hex'));

  function getRSAPrivateKey(version) {
    if (version == 1) {
      return privateKey0;
    } else if (version == 2) {
      return privateKey1;
    }
  }

  beforeAll(async () => {
    jest.setTimeout(20000);

    chain = await Chain.setupChain('WAX');

    // Create accounts
    orngContract = await chain.system.createAccount(orngContract, "10000.00000000 WAX", 4565215);
    orngOracle = await chain.system.createAccount(orngOracle, "10000.00000000 WAX", 4565215);
    orngOracle2 = await chain.system.createAccount(orngOracle2, "10000.00000000 WAX", 4565215);
    orngOracle3 = await chain.system.createAccount(orngOracle3, "10000.00000000 WAX", 4565215);
    orngOracle4 = await chain.system.createAccount(orngOracle4, "10000.00000000 WAX", 4565215);
    dappContract = await chain.system.createAccount(dappContract, "10000.00000000 WAX", 4565215);
    legacyDapp1 = await chain.system.createAccount(legacyDapp1, "10000.00000000 WAX", 4565215);
    legacyDapp2 = await chain.system.createAccount(legacyDapp2, "10000.00000000 WAX", 4565215);
    newDapp = await chain.system.createAccount(newDapp, "10000.00000000 WAX", 4565215);
    testToken = await chain.system.createAccount(testToken, "10000.00000000 WAX", 4565215);
    govAccount = orngContract;

    // Set up test token contract
    await testToken.setContract({
      abi: './tests/contracts/eosio.token.abi',
      wasm: './tests/contracts/eosio.token.wasm',
    });
    await testToken.addCode('active');

    // Set up ORNG contract
    await orngContract.setContract({
      abi: './build/wax.orng.abi',
      wasm: './build/wax.orng.wasm',
    });
    await orngContract.addCode('active');

    // Set up dApp contracts
    await dappContract.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });
    await dappContract.addCode('active');

    await legacyDapp1.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });
    await legacyDapp1.addCode('active');

    await legacyDapp2.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });
    await legacyDapp2.addCode('active');

    await newDapp.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });
    await newDapp.addCode('active');

    // Set up RSA public key
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

    // Create pause permission
    let auth = {
      threshold: 1,
      accounts: [{ permission: { actor: orngContract.name, permission: 'active' }, weight: 1 }],
      keys: [],
      waits: [],
    };
    await orngContract.updateAuth(
      'pause',
      'active',
      auth.threshold,
      auth.keys,
      auth.accounts,
      auth.waits
    );

    await orngContract.linkAuth(orngContract.name, 'pause', 'pause');
    await orngContract.linkAuth(orngContract.name, 'pauserequest', 'pause');

    // Set up oracles
    await orngContract.contract.action.setoracles(
      {
        oracles: [orngOracle.name, orngOracle2.name],
      },
      [
        {
          actor: govAccount.name,
          permission: 'active',
        },
      ]
    );

    // Configure contract
    await orngContract.contract.action.configv2(
      {
        fee_per_call: '0.00500000 WAX',
        strike_max: 3,
        k_calls_per_wax: 10,
        free_calls_per_hour: 5,
        treas_hardfloor: 10,
      },
      [
        {
          actor: orngContract.name,
          permission: 'active',
        },
      ]
    );

    // Fund the treasury to meet the hardfloor requirement
    // Create a temporary account to deposit to treasury
    const treasuryFunder = await chain.system.createAccount('treasfunder', '1000.00000000 WAX', 4565215);
    // Deposit to treasury using the "treasury" memo
    await treasuryFunder.transfer(orngContract.name, '100.00000000 WAX', 'treasury');

    // Create and issue test tokens
    await testToken.contract.action.create(
      {
        issuer: testToken.name,
        maximum_supply: "1000000000000.0000 TST",
      },
      [{ actor: testToken.name, permission: 'active' }]
    );

    await testToken.contract.action.issue(
      {
        to: testToken.name,
        quantity: "1000000000000.0000 TST",
        memo: "issue",
      },
      [{ actor: testToken.name, permission: 'active' }]
    );
  });

  afterAll(async () => {
    await chain.clear();
  }, 10000);

  describe('Collection Config Tests', () => {
    it('should set sunsetmonth config', async () => {
      // Set the default sunset months to 12
      await orngContract.contract.action.setconfig(
        {
          config: 'sunsetmonth',
          value: 12,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Verify it was set correctly
      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
      });

      const sunsetMonthName = stringToName('sunsetmonth');
      const sunsetRow = configTable.rows.find(r => r.name === sunsetMonthName);
      expect(sunsetRow).toBeDefined();
      expect(sunsetRow.value).toBe(12);
      console.log('Sunset months config set to:', sunsetRow.value);
    });

    it('should check initial collection config state', async () => {
      // Check the global config table for collection-related settings
      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
      });

      // Helper function to find config value by name
      const findConfig = (name) => {
        const nameValue = stringToName(name);
        const row = configTable.rows.find(r => r.name === nameValue);
        return row ? row.value : undefined;
      };

      // Check collection_enabled (collecten) - should be 0 (disabled) initially
      const collectionEnabled = findConfig('collecten');
      if (collectionEnabled !== undefined) {
        expect(collectionEnabled).toBe(0);
        console.log('Collection enabled:', collectionEnabled);
      }

      // Check collection_start (collectst)
      const collectionStart = findConfig('collectst');
      if (collectionStart !== undefined) {
        console.log('Collection start time:', collectionStart);
      }

      // Check collection_end (collectend)
      const collectionEnd = findConfig('collectend');
      if (collectionEnd !== undefined) {
        console.log('Collection end time:', collectionEnd);
      }

      // Check default_sunset_months (sunsetmonth) - should be 12 after previous test
      const sunsetMonths = findConfig('sunsetmonth');
      expect(sunsetMonths).toBeDefined();
      expect(sunsetMonths).toBe(12);
      console.log('Default sunset months:', sunsetMonths);

      // Check allowlist_enabled (allowlisten) - should be 0 (disabled) initially
      const allowlistEnabled = findConfig('allowlisten');
      if (allowlistEnabled !== undefined) {
        expect(allowlistEnabled).toBe(0);
        console.log('Allowlist enabled:', allowlistEnabled);
      }

      // Check legacycb table (should be empty initially)
      const legacyCallbackTable = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });
      expect(legacyCallbackTable.rows.length).toBe(0);
      console.log('Legacy callback table entries:', legacyCallbackTable.rows.length);
    });

    it('should reject setconfig from non-contract account', async () => {
      await expect(
        orngContract.contract.action.setconfig(
          {
            config: 'sunsetmonth',
            value: 24,
          },
          [
            {
              actor: dappContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('missing authority of ' + orngContract.name);
    });

    it('should update sunsetmonth config value', async () => {
      // Update to 18 months
      await orngContract.contract.action.setconfig(
        {
          config: 'sunsetmonth',
          value: 18,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Verify the update
      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
      });

      const sunsetMonthName = stringToName('sunsetmonth');
      const sunsetRow = configTable.rows.find(r => r.name === sunsetMonthName);
      expect(sunsetRow).toBeDefined();
      expect(sunsetRow.value).toBe(18);
      console.log('Sunset months updated to:', sunsetRow.value);

      // Reset back to 12 for other tests
      await orngContract.contract.action.setconfig(
        {
          config: 'sunsetmonth',
          value: 12,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
    });
  });

  describe('Code Hash Collection Tests', () => {
    it('should enable collection mode', async () => {
      // Enable collection mode for 30 days (30 * 24 * 60 * 60 seconds)
      const durationSeconds = 30 * 24 * 60 * 60;
      await orngContract.contract.action.enablecoll(
        {
          duration_seconds: durationSeconds,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Verify collection is enabled
      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
      });

      const collectenName = stringToName('collecten');
      const collectenRow = configTable.rows.find(r => r.name === collectenName);
      expect(collectenRow).toBeDefined();
      expect(collectenRow.value).toBe(1); // 1 = enabled
      console.log('Collection enabled:', collectenRow.value);

      // Check collection_start and collection_end times are set
      const collectstName = stringToName('collectst');
      const collectstRow = configTable.rows.find(r => r.name === collectstName);
      expect(collectstRow).toBeDefined();
      expect(collectstRow.value).toBeGreaterThan(0);
      console.log('Collection start time:', collectstRow.value);

      const collectendName = stringToName('collectend');
      const collectendRow = configTable.rows.find(r => r.name === collectendName);
      expect(collectendRow).toBeDefined();
      expect(collectendRow.value).toBeGreaterThan(collectstRow.value);
      console.log('Collection end time:', collectendRow.value);
    });

    it('should record code hash when requesting random number', async () => {
      jest.setTimeout(60000);

      // Register and deposit for the dapp (to cover treasury requirement)
      await orngContract.contract.action.reguser(
        {
          user: dappContract.name,
          dapp: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      // Deposit funds to cover paid calls
      await dappContract.transfer(orngContract.name, '50.00000000 WAX', 'deposit-' + dappContract.name);

      // Also stake to get some free credits
      await dappContract.transfer(orngContract.name, '100.00000000 WAX', 'stake-' + dappContract.name);

      // Wait a bit to accumulate credits
      await chain.waitTillNextBlock(30);

      // Request random number
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 1,
          signing_value: 12345,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      // Check if code hash was recorded in legacycb table
      const legacyTable = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });

      console.log('Legacy callback table entries:', legacyTable.rows.length);
      console.log('Legacy callback table:', JSON.stringify(legacyTable.rows, null, 2));
      // code hash: d480451adf587d84b4f8e4b17413f922e272136d2b10004d462c3ff64ac6678d
      // Verify the code hash was recorded
      expect(legacyTable.rows.length).toBeGreaterThan(0);
      const dappEntry = legacyTable.rows.find(r => r.dapp === dappContract.name);
      expect(dappEntry).toBeDefined();
      expect(dappEntry.code_hash).toBeDefined(); // Code hash should exist
      expect(dappEntry.code_hash.length).toBeGreaterThan(0); // Should not be empty
      expect(dappEntry.auto_collected).toBe(1); // Should be marked as auto-collected
      expect(dappEntry.sunset_time).toBeDefined(); // Should have a sunset timestamp
      console.log('Recorded entry for', dappContract.name, ':', dappEntry);
    });

    it('should not duplicate code hash entries for same dapp', async () => {
      // Request another random number from the same dapp
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 2,
          signing_value: 54321,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      // Check that we still only have one entry for this dapp
      const legacyTable = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });

      const dappEntries = legacyTable.rows.filter(r => r.dapp === dappContract.name);
      expect(dappEntries.length).toBe(1);
      console.log('Still only one entry for dapp after second request');
    });

    it('should record different code hashes for different dapps', async () => {
      jest.setTimeout(60000);

      // Register and deposit for legacy dapp
      await orngContract.contract.action.reguser(
        {
          user: legacyDapp1.name,
          dapp: legacyDapp1.name,
        },
        [
          {
            actor: legacyDapp1.name,
            permission: 'active',
          },
        ]
      );

      // Deposit funds to cover paid calls
      await legacyDapp1.transfer(orngContract.name, '50.00000000 WAX', 'deposit-' + legacyDapp1.name);

      // Also stake to get some free credits
      await legacyDapp1.transfer(orngContract.name, '100.00000000 WAX', 'stake-' + legacyDapp1.name);
      await chain.waitTillNextBlock(30);

      // Request random number from legacy dapp
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 100,
          signing_value: 99999,
          caller: legacyDapp1.name,
        },
        [
          {
            actor: legacyDapp1.name,
            permission: 'active',
          },
        ]
      );

      // Check legacycb table now has entries for both dapps
      const legacyTable = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });

      console.log('Total entries in legacycb:', legacyTable.rows.length);
      expect(legacyTable.rows.length).toBeGreaterThanOrEqual(2);

      const legacy1Entry = legacyTable.rows.find(r => r.dapp === legacyDapp1.name);
      expect(legacy1Entry).toBeDefined();
      expect(legacy1Entry.code_hash).toBeDefined(); // Code hash should exist
      expect(legacy1Entry.code_hash.length).toBeGreaterThan(0); // Should not be empty
      expect(legacy1Entry.auto_collected).toBe(1);

      // Verify first dapp entry still exists
      const dappEntry = legacyTable.rows.find(r => r.dapp === dappContract.name);
      expect(dappEntry).toBeDefined();

      console.log('Both dapps recorded with their respective code hashes');
    });

    it('should disable collection mode', async () => {
      // Disable collection mode
      await orngContract.contract.action.disablecoll(
        {},
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Verify collection is disabled
      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
      });

      const collectenName = stringToName('collecten');
      const collectenRow = configTable.rows.find(r => r.name === collectenName);
      expect(collectenRow).toBeDefined();
      expect(collectenRow.value).toBe(0); // 0 = disabled
      console.log('Collection disabled:', collectenRow.value);
    });

    it('should not record code hash when collection is disabled', async () => {
      jest.setTimeout(60000);

      // Register and deposit for new dapp
      await orngContract.contract.action.reguser(
        {
          user: newDapp.name,
          dapp: newDapp.name,
        },
        [
          {
            actor: newDapp.name,
            permission: 'active',
          },
        ]
      );

      // Deposit funds to cover paid calls
      await newDapp.transfer(orngContract.name, '50.00000000 WAX', 'deposit-' + newDapp.name);

      // Also stake to get some free credits
      await newDapp.transfer(orngContract.name, '100.00000000 WAX', 'stake-' + newDapp.name);
      await chain.waitTillNextBlock(30);

      // Get count before request
      const legacyTableBefore = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });
      const countBefore = legacyTableBefore.rows.length;

      // Request random number (collection is disabled)
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 200,
          signing_value: 11111,
          caller: newDapp.name,
        },
        [
          {
            actor: newDapp.name,
            permission: 'active',
          },
        ]
      );

      // Check that no new entry was added
      const legacyTableAfter = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });

      expect(legacyTableAfter.rows.length).toBe(countBefore);
      const newDappEntry = legacyTableAfter.rows.find(r => r.dapp === newDapp.name);
      expect(newDappEntry).toBeUndefined();
      console.log('No new entry added when collection is disabled');
    });
  });

  describe('Allowlist Enforcement Tests', () => {
    it('should verify dappContract and legacyDapp1 are in legacycb table from collection mode', async () => {
      // These dapps were already auto-collected during the "Code Hash Collection Tests" above
      const legacyTable = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });

      const dappEntry = legacyTable.rows.find(r => r.dapp === dappContract.name);
      const legacy1Entry = legacyTable.rows.find(r => r.dapp === legacyDapp1.name);

      expect(dappEntry).toBeDefined();
      expect(legacy1Entry).toBeDefined();
      console.log('Dapps already in legacycb table:', [dappContract.name, legacyDapp1.name]);
      console.log('dappContract entry:', dappEntry);
      console.log('legacyDapp1 entry:', legacy1Entry);
    });

    it('should enable allowlist enforcement mode', async () => {
      // Enable allowlist enforcement mode
      // This means: only dapps in legacycb table with valid code hash get legacy callback
      // All others get notification only
      await orngContract.contract.action.setconfig(
        {
          config: 'allowlisten',
          value: 1,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Verify allowlist is enabled
      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
      });

      const allowlistenName = stringToName('allowlisten');
      const allowlistenRow = configTable.rows.find(r => r.name === allowlistenName);
      expect(allowlistenRow).toBeDefined();
      expect(allowlistenRow.value).toBe(1); // 1 = enabled
      console.log('Allowlist enforcement enabled:', allowlistenRow.value);
    });

    it('should successfully deliver random number to allowed dapp via legacy callback', async () => {
      jest.setTimeout(60000);

      // dappContract is in legacycb table (auto-collected earlier), so it gets legacy callback
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 300,
          signing_value: 77777,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      // Get the request from the requests table
      const reqsTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      const request = reqsTable.rows.find(
        r => r.assoc_id == 300 && r.dapp === dappContract.name
      );
      expect(request).toBeDefined();

      // Extract request details for signature
      const seed = request.seed;
      const version = request.ver;
      const nonce = request.nonce;
      const jobId = request.id;

      // Create the message and sign it
      const msg = make_msg(seed, dappContract.name, nonce);
      const rsaSigning = new RSASigning(getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      // Submit oracle signature
      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle.name,
          id: jobId,
          ver: version,
          sig: signed_value,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      // Check if the random value was delivered via legacy callback (receiverand)
      const receivedTable = await dappContract.contract.table['results'].get({
        scope: dappContract.name,
      });

      const receivedEntry = receivedTable.rows.find(r => r.assoc_id == 300);
      expect(receivedEntry).toBeDefined();
      expect(receivedEntry.random_value).toBeDefined();
      console.log('Random number delivered to dapp in legacycb via legacy callback:', receivedEntry);
    });

    it('should NOT deliver legacy callback to non-allowed dapp (legacyDapp2)', async () => {
      jest.setTimeout(60000);

      // legacyDapp2 is NOT in the legacycb table (collection mode was disabled before it made requests)
      // Therefore, with allowlist enforcement enabled, it should NOT receive legacy callback
      const legacyTable = await orngContract.contract.table['legacycb'].get({
        scope: orngContract.name,
      });
      const legacyDapp2Entry = legacyTable.rows.find(r => r.dapp === legacyDapp2.name);
      expect(legacyDapp2Entry).toBeUndefined();
      console.log('Confirmed: legacyDapp2 is NOT in legacycb table');

      // Register and deposit for legacyDapp2 if not already done
      try {
        await orngContract.contract.action.reguser(
          {
            user: legacyDapp2.name,
            dapp: legacyDapp2.name,
          },
          [
            {
              actor: legacyDapp2.name,
              permission: 'active',
            },
          ]
        );

        await legacyDapp2.transfer(orngContract.name, '50.00000000 WAX', 'deposit-' + legacyDapp2.name);
        await legacyDapp2.transfer(orngContract.name, '100.00000000 WAX', 'stake-' + legacyDapp2.name);
        await chain.waitTillNextBlock(30);
      } catch (e) {
        // May already be registered
        console.log('legacyDapp2 may already be registered');
      }

      // Request random number from non-allowed dapp (legacyDapp2)
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 400,
          signing_value: 88888,
          caller: legacyDapp2.name,
        },
        [
          {
            actor: legacyDapp2.name,
            permission: 'active',
          },
        ]
      );

      // Get the request from the requests table
      const reqsTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });
      const request = reqsTable.rows.find(
        r => r.assoc_id == 400 && r.dapp === legacyDapp2.name
      );
      expect(request).toBeDefined();

      console.log("reqs table :", reqsTable);
      // Extract request details for signature
      const seed = request.seed;
      const version = request.ver;
      const nonce = request.nonce;
      const jobId = request.id;

      // Create the message and sign it
      const msg = make_msg(seed, legacyDapp2.name, nonce);
      const rsaSigning = new RSASigning(getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);
      console.log('Submitting oracle signature for legacyDapp2 request');

      // Submit oracle signature
      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle.name,
          id: jobId,
          ver: version,
          sig: signed_value,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      console.log('Submitted oracle signature for legacyDapp2 request', signed_value);

      // Check that the random value was NOT delivered via legacy callback (receiverand)
      // Because legacyDapp2 is not in legacycb table and allowlist enforcement is enabled
      const receivedTable = await legacyDapp2.contract.table['results'].get({
        scope: legacyDapp2.name,
      });

      const receivedEntry = receivedTable.rows.find(r => r.assoc_id == 400);
      expect(receivedEntry).toBeUndefined();
      console.log('Legacy callback NOT delivered to legacyDapp2 (not in legacycb table)');

      // Verify the request was fulfilled (notification sent instead)
      const reqsTableAfter = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      const requestAfter = reqsTableAfter.rows.find(
        r => r.assoc_id == 400 && r.dapp == legacyDapp2.name
      );
      // Request should be cleared from the table after fulfillment
      expect(requestAfter).toBeUndefined();
      console.log('Request was fulfilled - notification sent instead of legacy callback');
    });

    it('should disable allowlist enforcement and enable dual delivery mode', async () => {
      jest.setTimeout(60000);

      // Disable allowlist enforcement (enter dual delivery mode)
      // In dual delivery mode: ALL dapps get both legacy callback AND notification
      await orngContract.contract.action.setconfig(
        {
          config: 'allowlisten',
          value: 0,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Verify allowlist enforcement is disabled (dual delivery mode enabled)
      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
      });

      const allowlistenName = stringToName('allowlisten');
      const allowlistenRow = configTable.rows.find(r => r.name === allowlistenName);
      expect(allowlistenRow).toBeDefined();
      expect(allowlistenRow.value).toBe(0); // 0 = disabled (dual delivery mode)
      console.log('Allowlist enforcement disabled - dual delivery mode active:', allowlistenRow.value);

      // Now request from legacyDapp2 again - it should receive legacy callback in dual delivery mode
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 500,
          signing_value: 99999,
          caller: legacyDapp2.name,
        },
        [
          {
            actor: legacyDapp2.name,
            permission: 'active',
          },
        ]
      );

      // Get the request from the requests table
      const reqsTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      const request = reqsTable.rows.find(
        r => r.assoc_id == 500 && r.dapp === legacyDapp2.name
      );
      expect(request).toBeDefined();

      // Extract request details for signature
      const seed = request.seed;
      const version = request.ver;
      const nonce = request.nonce;
      const jobId = request.id;

      // Create the message and sign it
      const msg = make_msg(seed, legacyDapp2.name, nonce);
      const rsaSigning = new RSASigning(getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      // Submit oracle signature
      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle.name,
          id: jobId,
          ver: version,
          sig: signed_value,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      // Check that the random value WAS delivered this time via legacy callback
      // In dual delivery mode, ALL dapps get both legacy callback and notification
      const receivedTable = await legacyDapp2.contract.table['results'].get({
        scope: legacyDapp2.name,
      });

      const receivedEntry = receivedTable.rows.find(r => r.assoc_id == 500);
      expect(receivedEntry).toBeDefined();
      expect(receivedEntry.random_value).toBeDefined();
    });
  });
});
