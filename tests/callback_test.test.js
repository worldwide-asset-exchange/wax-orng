const vert = require('@vaulta/vert');
const { Blockchain, nameToBigInt, expectToThrow, mintTokens } = vert;
const { assert, expect } = require('chai');
const crypto = require('crypto');
const fs = require('fs');
const { RSASigning, make_msg } = require('./rsaSigning.js');
const { Name, Int64 } = require("@wharfkit/antelope");

function stringHashToNum(str) {
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    let bytes = str.slice(i * 2, i * 2 + 2);
    const a = parseInt(bytes, 16) & 127;
    result = (result << BigInt(8)) + BigInt(a);
  }
  return result.toString();
}

// Helper function to create time object for blockchain.addTime()
function seconds(s) {
  return {
    toMilliseconds: () => s * 1000
  };
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function getActivePermission(actors) {
  const permisisons = [];
  for (const actor of actors) {
    let permission = {
      actor,
      permission: "active",
    };
    permisisons.push(permission);
  }
  return permisisons;
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
  let blockchain;
  let tokenContract;
  let systemContract = 'eosio';
  let orngContract;
  let govAccount;
  let orngOracle;
  let orngOracle2;
  let orngOracle3;
  let orngOracle4;
  let dappContract;
  let legacyDapp1;
  let legacyDapp2;
  let newDapp;
  let treasuryAccount;
  let delphiAccount;

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

  async function initDelphioracle(delphiAccount) {
    console.log('delphioracle init', delphiAccount.name.toString());

    let now = new Date();
    let nowString = now.toISOString().replace('Z', '');
    console.log('nowString', nowString);

    // Create the waxpusd pair in the pairs table
    delphiAccount.tables.pairs(nameToBigInt('delphioracle')).set(
      nameToBigInt('waxpusd'),
      delphiAccount.name,
      {
        active: true,
        bounty_awarded: false,
        bounty_edited_by_custodians: false,
        proposer: delphiAccount.name.toString(),
        name: 'waxpusd',
        bounty_amount: '0.0000 WAX',
        approving_custodians: [],
        approving_oracles: [],
        base_symbol: '8,WAXP',
        base_type: 4,
        base_contract: '',
        quote_symbol: '4,USD',
        quote_type: 1,
        quote_contract: '',
        quoted_precision: 4,
        timestamp: nowString
      }
    );

    const datapoints = [
        {
          id: 21,
          owner: "pink.gg",
          value: 3090,
          median: 3064,
          timestamp: nowString,
        },
        {
          id: 22,
          owner: "wizardsguild",
          value: 3075,
          median: 3075,
          timestamp: nowString,
        },
        {
          id: 23,
          owner: "wax.eastern",
          value: 3068,
          median: 3075,
          timestamp: nowString,
        },
        {
          id: 24,
          owner: "alohaeosprod",
          value: 3075,
          median: 3075,
          timestamp: nowString,
        },
        {
          id: 25,
          owner: "ivote4waxusa",
          value: 3134,
          median: 3075,
          timestamp: nowString,
        },
        {
          id: 26,
          owner: "eosphereiobp",
          value: 3067,
          median: 3075,
          timestamp: nowString,
        },
        {
          id: 27,
          owner: "eosdublinwow",
          value: 3128,
          median: 3075,
          timestamp: nowString,
        },
        {
          id: 28,
          owner: "bountyblokbp",
          value: 3067,
          median: 3066,
          timestamp: nowString,
        },
        {
          id: 29,
          owner: "blocksmithio",
          value: 3065,
          median: 3066,
          timestamp: nowString,
        },
        {
          id: 30,
          owner: "liquidstudio",
          value: 3075,
          median: 3067,
          timestamp: nowString,
        },
    ];

    // Add all datapoints to the table
    for (const datapoint of datapoints) {
      delphiAccount.tables.datapoints(nameToBigInt('waxpusd')).set(
        BigInt(datapoint.id),
        delphiAccount.name,
        datapoint
      );
    }
  }

  before(async () => {
    blockchain = new Blockchain();

    // Deploy eosio.token contract
    tokenContract = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
      enableInline: true,
    });

    // Create regular accounts first
    const accounts = blockchain.createAccounts(
      'oracle.wax',
      'oracle2.wax',
      'oracle3.wax',
      'oracle4.wax',
      'dapp.wax',
      'legacy1.wax',
      'legacy2.wax',
      'newdapp.wax',
      'treasury1'
    );

    orngOracle = accounts[0];
    orngOracle2 = accounts[1];
    orngOracle3 = accounts[2];
    orngOracle4 = accounts[3];
    dappContract = accounts[4];
    legacyDapp1 = accounts[5];
    legacyDapp2 = accounts[6];
    newDapp = accounts[7];
    treasuryAccount = accounts[8];

    // Deploy orng contract with wasm/abi
    orngContract = blockchain.createAccount({
      name: Name.from('orng.wax'),
      wasm: fs.readFileSync('./build/wax.orng.wasm'),
      abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
      enableInline: true,
    });
    govAccount = orngContract;

    // Deploy delphioracle contract with wasm/abi
    delphiAccount = blockchain.createAccount({
      name: Name.from('delphioracle'),
      wasm: fs.readFileSync('./tests/contracts/delphioracle.wasm'),
      abi: fs.readFileSync('./tests/contracts/delphioracle.abi', 'utf8'),
      enableInline: true,
    });

    // Issue tokens to accounts
    const accountsToFund = [
      orngOracle,
      orngOracle2,
      orngOracle3,
      orngOracle4,
      dappContract,
      legacyDapp1,
      legacyDapp2,
      newDapp,
      treasuryAccount
    ];

    await mintTokens(tokenContract, 'WAX', 8, 1000000000, 10000, accountsToFund);

    await initDelphioracle(delphiAccount);

    // Deploy dApp contracts (vert doesn't need separate setContract/addCode, already deployed)
    // Just redeploy the dapp accounts with contracts
    dappContract = blockchain.createAccount({
      name: Name.from('dapp.wax'),
      wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
      abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
      enableInline: true,
    });

    legacyDapp1 = blockchain.createAccount({
      name: Name.from('legacy1.wax'),
      wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
      abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
      enableInline: true,
    });

    legacyDapp2 = blockchain.createAccount({
      name: Name.from('legacy2.wax'),
      wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
      abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
      enableInline: true,
    });

    newDapp = blockchain.createAccount({
      name: Name.from('newdapp.wax'),
      wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
      abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
      enableInline: true,
    });

    // Set up RSA public key
    await orngContract.actions.setpubkey([
      1,
      exponent0,
      modulus0
    ]).send('orng.wax@active');

    // Set up oracles
    await orngContract.actions.setoracles([
      [orngOracle.name.toString(), orngOracle2.name.toString()]
    ]).send('orng.wax@active');

    // Configure contract
    await orngContract.actions.configv2([
      '0.00500000 WAX',
      3
    ]).send('orng.wax@active');

    // Fund the treasury to meet the hardfloor requirement
    await tokenContract.actions.transfer([
      treasuryAccount.name.toString(),
      orngContract.name.toString(),
      '100.00000000 WAX',
      'treasury'
    ]).send('treasury1@active');
  });

  after(async () => {
    // Cleanup if needed
  });

  describe('Collection Config Tests', () => {
    it('should set sunsetmonth config', async () => {
      // Set the default sunset months to 12
      await orngContract.actions.setconfig([
        'sunsetmonth',
        12
      ]).send('orng.wax@active');

      // Verify it was set correctly
      const sunsetMonthName = stringToName('sunsetmonth');
      const sunsetRow = orngContract.tables['config.a'](nameToBigInt('orng.wax'))
        .getTableRow(sunsetMonthName);

      expect(sunsetRow).to.exist;
      expect(sunsetRow.value).to.equal(12);
      console.log('Sunset months config set to:', sunsetRow.value);
    });

    it('should check initial collection config state', async () => {
      // Check the global config table for collection-related settings
      const configTable_rows = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString())).getTableRows();

      // Helper function to find config value by name
      const findConfig = (name) => {
        const nameValue = stringToName(name);
        const row = configTable_rows.find(r => r.name === nameValue);
        return row ? row.value : undefined;
      };

      // Check collection_enabled (collecten) - should be 0 (disabled) initially
      const collectionEnabled = findConfig('collecten');
      if (collectionEnabled !== undefined) {
        expect(collectionEnabled).to.equal(0);
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

      // Check allowlist_enabled (allowlist) - should be 0 (disabled) initially
      const allowlistEnabled = findConfig('allowlist');
      if (allowlistEnabled !== undefined) {
        expect(allowlistEnabled).to.equal(0);
        console.log('Allowlist enabled:', allowlistEnabled);
      }

      // Check legacycb table (should be empty initially)
      const legacyCallbackTable_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();
      expect(legacyCallbackTable_rows.length).to.equal(0);
      console.log('Legacy callback table entries:', legacyCallbackTable_rows.length);
    });

    it('should reject setconfig from non-contract account', async () => {
      await expectToThrow(
        orngContract.actions.setconfig([
          'sunsetmonth',
          24
        ]).send('dapp.wax@active'),
        'missing required authority orng.wax'
      );
    });

    it('should update sunsetmonth config value', async () => {
      // Update to 18 months
      await orngContract.actions.setconfig([
        'sunsetmonth',
        18
      ]).send('orng.wax@active');

      // Verify the update
      const configTable_rows = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString())).getTableRows();

      const sunsetMonthName = stringToName('sunsetmonth');
      const sunsetRow = configTable_rows.find(r => r.name === sunsetMonthName);
      expect(sunsetRow).to.exist;
      expect(sunsetRow.value).to.equal(18);
      console.log('Sunset months updated to:', sunsetRow.value);

      // Reset back to 12 for other tests
      await orngContract.actions.setconfig([
        'sunsetmonth',
        12
      ]).send('orng.wax@active');
    });
  });

  describe('Code Hash Collection Tests', () => {
    it('should enable collection mode', async () => {
      // Enable collection mode for 30 days (30 * 24 * 60 * 60 seconds)
      const durationSeconds = 30 * 24 * 60 * 60;
      await blockchain.addTime(seconds(10)); // Ensure time has progressed
      await orngContract.actions.enablecoll([durationSeconds]).send('orng.wax@active');

      // Verify collection is enabled
      const configTable_rows = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString())).getTableRows();
      console.log('Config table after enabling collection:', JSON.stringify(configTable_rows, null, 2));

      const collectenName = stringToName('collecten');
      const collectenRow = configTable_rows.find(r => r.name === collectenName);
      expect(collectenRow).to.exist;
      expect(collectenRow.value).to.equal(1); // 1 = enabled
      console.log('Collection enabled:', collectenRow.value);

      // Check collection_start and collection_end times are set
      const collectstName = stringToName('collectst');
      const collectstRow = configTable_rows.find(r => r.name === collectstName);
      expect(collectstRow).to.exist;
      expect(collectstRow.value).to.be.above(0);
      console.log('Collection start time:', collectstRow.value);

      const collectendName = stringToName('collectend');
      const collectendRow = configTable_rows.find(r => r.name === collectendName);
      expect(collectendRow).to.exist;
      expect(collectendRow.value).to.be.above(collectstRow.value);
      console.log('Collection end time:', collectendRow.value);
    });

    it('should record code hash when requesting random number', async () => {

      // Deposit funds to cover paid calls
      await tokenContract.actions.transfer([dappContract.name.toString(), orngContract.name.toString(), '50.00000000 WAX', 'deposit-' + dappContract.name.toString()]).send('dapp.wax@active');

      // Also stake to get some free credits
      await tokenContract.actions.transfer([dappContract.name.toString(), orngContract.name.toString(), '100.00000000 WAX', 'stake-' + dappContract.name.toString()]).send('dapp.wax@active');

      // Wait a bit to accumulate credits
      blockchain.addTime(seconds(30));

      // Request random number
      await orngContract.actions.requestrand([1, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      // Check if code hash was recorded in legacycb table
      const legacyTable_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();

      console.log('Legacy callback table entries:', legacyTable_rows.length);
      console.log('Legacy callback table:', JSON.stringify(legacyTable_rows, null, 2));
      // code hash: d480451adf587d84b4f8e4b17413f922e272136d2b10004d462c3ff64ac6678d
      // Verify the code hash was recorded
      expect(legacyTable_rows.length).to.be.above(0);
      const dappEntry = legacyTable_rows.find(r => r.dapp === dappContract.name.toString());
      expect(dappEntry).to.exist;
      expect(dappEntry.code_hash).to.exist; // Code hash should exist
      expect(dappEntry.code_hash.length).to.be.above(0); // Should not be empty
      expect(dappEntry.auto_collected).to.equal(true); // Should be marked as auto-collected
    });

    it('should not duplicate code hash entries for same dapp', async () => {
      // Request another random number from the same dapp
      await orngContract.actions.requestrand([2, 54321, dappContract.name]).send(dappContract.name.toString() + '@active');

      // Check that we still only have one entry for this dapp
      const legacyTable_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();

      const dappEntries = legacyTable_rows.filter(r => r.dapp === dappContract.name.toString());
      expect(dappEntries.length).to.equal(1);
      console.log('Still only one entry for dapp after second request');
    });

    it('should record different code hashes for different dapps', async () => {

  

      // Deposit funds to cover paid calls
      await tokenContract.actions.transfer([legacyDapp1.name.toString(), orngContract.name.toString(), '50.00000000 WAX', 'deposit-' + legacyDapp1.name.toString()]).send('legacy1.wax@active');

      // Also stake to get some free credits
      await tokenContract.actions.transfer([legacyDapp1.name.toString(), orngContract.name.toString(), '100.00000000 WAX', 'stake-' + legacyDapp1.name.toString()]).send('legacy1.wax@active');
      blockchain.addTime(seconds(30));

      // Request random number from legacy dapp
      await orngContract.actions.requestrand([100, 99999, legacyDapp1.name]).send(legacyDapp1.name.toString() + '@active');

      // Check legacycb table now has entries for both dapps
      const legacyTable_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();

      console.log('Total entries in legacycb:', legacyTable_rows.length);
      expect(legacyTable_rows.length).to.be.at.least(2);

      const legacy1Entry = legacyTable_rows.find(r => r.dapp === legacyDapp1.name.toString());
      expect(legacy1Entry).to.exist;
      expect(legacy1Entry.code_hash).to.exist; // Code hash should exist
      expect(legacy1Entry.code_hash.length).to.be.above(0); // Should not be empty
      expect(legacy1Entry.auto_collected).to.equal(true);

      // Verify first dapp entry still exists
      const dappEntry = legacyTable_rows.find(r => r.dapp === dappContract.name.toString());
      expect(dappEntry).to.exist;

      console.log('Both dapps recorded with their respective code hashes');
    });

    it('should disable collection mode', async () => {
      // Disable collection mode
      await orngContract.actions.disablecoll([]).send('orng.wax@active');

      // Verify collection is disabled
      const configTable_rows = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString())).getTableRows();

      const collectenName = stringToName('collecten');
      const collectenRow = configTable_rows.find(r => r.name === collectenName);
      expect(collectenRow).to.exist;
      expect(collectenRow.value).to.equal(0); // 0 = disabled
      console.log('Collection disabled:', collectenRow.value);
    });

    it('should not record code hash when collection is disabled', async () => {

      // Deposit funds to cover paid calls
      await tokenContract.actions.transfer([newDapp.name.toString(), orngContract.name.toString(), '50.00000000 WAX', 'deposit-' + newDapp.name.toString()]).send('newdapp.wax@active');

      // Also stake to get some free credits
      await tokenContract.actions.transfer([newDapp.name.toString(), orngContract.name.toString(), '100.00000000 WAX', 'stake-' + newDapp.name.toString()]).send('newdapp.wax@active');
      blockchain.addTime(seconds(30));

      // Get count before request
      const legacyTableBefore_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const countBefore = legacyTableBefore_rows.length;

      // Request random number (collection is disabled)
      await orngContract.actions.requestrand([200, 11111, newDapp.name]).send(newDapp.name.toString() + '@active');

      // Check that no new entry was added
      const legacyTableAfter_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();

      expect(legacyTableAfter_rows.length).to.equal(countBefore);
      const newDappEntry = legacyTableAfter_rows.find(r => r.dapp === newDapp.name);
      expect(newDappEntry).to.be.undefined;
      console.log('No new entry added when collection is disabled');
    });
  });

  describe('Allowlist Enforcement Tests', () => {
    it('should verify dappContract and legacyDapp1 are in legacycb table from collection mode', async () => {
      // These dapps were already auto-collected during the "Code Hash Collection Tests" above
      const legacyTable_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();

      const dappEntry = legacyTable_rows.find(r => r.dapp === dappContract.name.toString());
      const legacy1Entry = legacyTable_rows.find(r => r.dapp === legacyDapp1.name.toString());

      expect(dappEntry).to.exist;
      expect(legacy1Entry).to.exist;
    });

    it('should enable allowlist enforcement mode', async () => {
      // Enable allowlist enforcement mode
      // This means: only dapps in legacycb table with valid code hash get legacy callback
      // All others get notification only
      await orngContract.actions.setconfig(['allowlist', 1]).send('orng.wax@active');

      // Verify allowlist is enabled
      const configTable_rows = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString())).getTableRows();

      const allowlistenName = stringToName('allowlist');
      const allowlistenRow = configTable_rows.find(r => r.name === allowlistenName);
      expect(allowlistenRow).to.exist;
      expect(allowlistenRow.value).to.equal(1); // 1 = enabled
      console.log('Allowlist enforcement enabled:', allowlistenRow.value);
    });

    it('should successfully deliver random number to allowed dapp via legacy callback', async () => {

      // dappContract is in legacycb table (auto-collected earlier), so it gets legacy callback
      await orngContract.actions.requestrand([300, 77777, dappContract.name]).send(dappContract.name.toString() + '@active');

      // Get the request from the requests table
      const reqsTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const request = reqsTable_rows.find(
        r => r.assoc_id == 300 && r.dapp === dappContract.name.toString()
      );
      expect(request).to.exist;

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
      await orngContract.actions.setrand([orngOracle.name.toString(), jobId, version, signed_value]).send(orngOracle.name.toString() + '@active');

      // Check if the random value was delivered via legacy callback (receiverand)
      const receivedTable_rows = dappContract.tables.results(nameToBigInt(dappContract.name.toString())).getTableRows();
      console.log('dappContract results table entries:', receivedTable_rows);
      const receivedEntry = receivedTable_rows.find(r => r.assoc_id == 300);
      expect(receivedEntry).to.exist;
      expect(receivedEntry.random_value).to.exist;
      console.log('Random number delivered to dapp in legacycb via legacy callback:', receivedEntry);
    });

    it('should NOT deliver legacy callback to non-allowed dapp (legacyDapp2)', async () => {

      // legacyDapp2 is NOT in the legacycb table (collection mode was disabled before it made requests)
      // Therefore, with allowlist enforcement enabled, it should NOT receive legacy callback
      const legacyTable_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const legacyDapp2Entry = legacyTable_rows.find(r => r.dapp === legacyDapp2.name.toString());
      expect(legacyDapp2Entry).to.be.undefined;
      console.log('Confirmed: legacyDapp2 is NOT in legacycb table');
      try {
        await tokenContract.actions.transfer([legacyDapp2.name.toString(), orngContract.name.toString(), '50.00000000 WAX', 'deposit-' + legacyDapp2.name.toString()]).send('legacy2.wax@active');
        await tokenContract.actions.transfer([legacyDapp2.name.toString(), orngContract.name.toString(), '100.00000000 WAX', 'stake-' + legacyDapp2.name.toString()]).send('legacy2.wax@active');
        blockchain.addTime(seconds(30));
      } catch (e) {
        // May already be registered
        console.log('legacyDapp2 may already be registered');
      }

      // Request random number from non-allowed dapp (legacyDapp2)
      await orngContract.actions.requestrand([400, 88888, legacyDapp2.name]).send(legacyDapp2.name.toString() + '@active');

      // Get the request from the requests table
      const reqsTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const request = reqsTable_rows.find(
        r => r.assoc_id == 400 && r.dapp === legacyDapp2.name.toString()
      );
      expect(request).to.exist;

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
      await orngContract.actions.setrand([orngOracle.name.toString(), jobId, version, signed_value]).send(orngOracle.name.toString() + '@active');

      console.log('Submitted oracle signature for legacyDapp2 request', signed_value);

      // Check that the random value was NOT delivered via legacy callback (receiverand)
      // Because legacyDapp2 is not in legacycb table and allowlist enforcement is enabled
      const receivedTable_rows = legacyDapp2.tables['results'](nameToBigInt(legacyDapp2.name.toString())).getTableRows();

      const receivedEntry = receivedTable_rows.find(r => r.assoc_id == 400);
      expect(receivedEntry).to.be.undefined;
      console.log('Legacy callback NOT delivered to legacyDapp2 (not in legacycb table)');

      // Verify the request was fulfilled (notification sent instead)
      const reqsTableAfter_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const requestAfter = reqsTableAfter_rows.find(
        r => r.assoc_id == 400 && r.dapp == legacyDapp2.name.toString()
      );
      // Request should be cleared from the table after fulfillment
      expect(requestAfter).to.be.undefined;
      console.log('Request was fulfilled - notification sent instead of legacy callback');
    });

    it('should deliver notification to newDappV2 (notification-based contract) even when NOT in allowlist', async () => {

      // This test verifies that the ORNG contract successfully sends a notification to dApps
      // that are NOT in the allowlist when allowlist enforcement is enabled. The notification
      // mechanism uses the randnotify action with require_recipient(dapp), which triggers the
      // dApp's on_notify handler automatically.
      //
      // We verify:
      // 1. The request is fulfilled (removed from reqs table)
      // 2. The notification is delivered to the dApp's on_notify handler
      // 3. The dApp's results table is updated with the random value
      // 4. No legacy callback was attempted (since dApp is not in allowlist)

      // First, re-enable allowlist enforcement mode
      await orngContract.actions.setconfig(['allowlist', 1]).send('orng.wax@active');

      // Verify allowlist is enabled
      const configTable_rows = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString())).getTableRows();

      const allowlistenName = stringToName('allowlist');
      const allowlistenRow = configTable_rows.find(r => r.name === allowlistenName);
      expect(allowlistenRow).to.exist;
      expect(allowlistenRow.value).to.equal(1); // 1 = enabled
      console.log('Allowlist enforcement re-enabled:', allowlistenRow.value);

      // Create a new dapp account that will use v2 contract (notification-based)
      const newDappV2 = blockchain.createAccount({
        name: Name.from('newdappv2'),
        wasm: fs.readFileSync('./tests/contracts/randreceiverv2.wasm'),
        abi: fs.readFileSync('./tests/contracts/randreceiverv2.abi', 'utf8'),
      });

      // Verify newDappV2 is NOT in the legacycb allowlist
      const legacyTable_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const newDappV2Entry = legacyTable_rows.find(r => r.dapp === newDappV2.name);
      expect(newDappV2Entry).to.be.undefined;
      console.log('Confirmed: newDappV2 is NOT in legacycb allowlist');

      await tokenContract.actions.transfer([newDappV2.name.toString(), orngContract.name.toString(), '50.00000000 WAX', 'deposit-' + newDappV2.name.toString()]).send('newdappv2@active');
      await tokenContract.actions.transfer([newDappV2.name.toString(), orngContract.name.toString(), '100.00000000 WAX', 'stake-' + newDappV2.name.toString()]).send('newdappv2@active');
      blockchain.addTime(seconds(30));

      // Request random number from newDappV2
      await orngContract.actions.requestrand([600, 66666, newDappV2.name]).send(newDappV2.name.toString() + '@active');

      // Get the request from the requests table
      const reqsTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const request = reqsTable_rows.find(
        r => r.assoc_id == 600 && r.dapp === newDappV2.name.toString()
      );
      expect(request).to.exist;

      // Extract request details for signature
      const seed = request.seed;
      const version = request.ver;
      const nonce = request.nonce;
      const jobId = request.id;

      // Create the message and sign it
      const msg = make_msg(seed, newDappV2.name, nonce);
      const rsaSigning = new RSASigning(getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      // Submit oracle signature
      console.log('Submitting oracle signature for newDappV2 request, jobId:', jobId);
      await orngContract.actions.setrand([orngOracle.name.toString(), jobId, version, signed_value]).send(orngOracle.name.toString() + '@active');
      console.log('setrand completed for newDappV2');

      // Verify the request was fulfilled and removed from reqs table
      const reqsTableAfter_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const requestAfter = reqsTableAfter_rows.find(
        r => r.assoc_id == 600 && r.dapp == newDappV2.name.toString()
      );
      expect(requestAfter).to.be.undefined;
      console.log('Request was fulfilled and removed from reqs table');

      // Verify the notification was successfully delivered to newDappV2's on_notify handler
      // Since newDappV2 is NOT in the allowlist, the ORNG contract sends a notification
      // (not a legacy callback), which triggers the dApp's on_notify handler automatically.
      const receivedTable_rows = newDappV2.tables['results'](nameToBigInt(newDappV2.name.toString())).getTableRows();
      const receivedEntry = receivedTable_rows.find(r => r.assoc_id == 600);

      // Verify the notification was received and processed
      expect(receivedEntry).to.exist;
      expect(receivedEntry.random_value).to.exist;
      console.log('Notification successfully delivered to newDappV2 via on_notify handler:', receivedEntry);

      // Verify no entry exists in the undelivered table (notifications don't use this table,
      // only failed legacy callbacks do)
      const undeliveredTable_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const undeliveredEntry = undeliveredTable.rows.find(
        r => r.dapp === newDappV2.name.toString() && r.assoc_id == 600
      );
      expect(undeliveredEntry).to.be.undefined;
      console.log('No undelivered entry (as expected for notification-based delivery)');
    });

    it('should remove dApp from legacycb table when code is updated (v1 to v3 upgrade)', async () => {

      // Step 1: Create a new dApp account (dappV1)
      const dappV1 = blockchain.createAccount({
        name: Name.from('dappv1'),
        wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
        abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
      });

      // Step 3: Re-enable collection mode temporarily to auto-collect the code hash
      await orngContract.actions.enablecoll([30 * 24 * 60 * 60]).send('orng.wax@active');

      await tokenContract.actions.transfer([dappV1.name.toString(), orngContract.name.toString(), '50.00000000 WAX', 'deposit-' + dappV1.name.toString()]).send('dappv1@active');
      await tokenContract.actions.transfer([dappV1.name.toString(), orngContract.name.toString(), '100.00000000 WAX', 'stake-' + dappV1.name.toString()]).send('dappv1@active');
      blockchain.addTime(seconds(30));

      // Step 5: Make a request to trigger code hash collection
      await orngContract.actions.requestrand([1000, 11111, dappV1.name]).send(dappV1.name.toString() + '@active');

      // Step 6: Verify dappV1 is in legacycb table with original code hash
      const legacyTableBefore_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const dappV1EntryBefore = legacyTableBefore_rows.find(r => r.dapp === dappV1.name);
      expect(dappV1EntryBefore).to.exist;
      expect(dappV1EntryBefore.code_hash).to.exist;
      const originalCodeHash = dappV1EntryBefore.code_hash;
      console.log('dappV1 registered in legacycb with code hash:', originalCodeHash);

      // Step 7: Update dappV1 contract to randreceiverv3
      await dappV1.setContract({
        wasm: './tests/contracts/randreceiverv3.wasm',
        abi: './tests/contracts/randreceiverv3.abi',
      });

      console.log('Updated dappV1 to randreceiverv3 contract');

      // Step 8: Call verifyhash action
      await orngContract.actions.verifyhash([dappV1.name]).send('orng.wax@active');

      console.log('Called verifyhash for dappV1');

      // Step 9: Verify dappV1 is removed from legacycb table
      const legacyTableAfter_rows = orngContract.tables['legacycb'](nameToBigInt(orngContract.name.toString())).getTableRows();
      const dappV1EntryAfter = legacyTableAfter_rows.find(r => r.dapp === dappV1.name);
      expect(dappV1EntryAfter).to.be.undefined;
      console.log('dappV1 successfully removed from legacycb table after code upgrade');
    });
  });
});
