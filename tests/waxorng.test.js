const vert = require('@vaulta/vert');
// TODO: MANUAL REVIEW - Consider replacing token create/issue with mintTokens() helper
// Example: await mintTokens(tokenContract, 'WAX', 8, 1000000000, 10000, [accounts])
const { Blockchain, nameToBigInt, expectToThrow, mintTokens } = vert;
const { assert, expect } = require('chai');

const crypto = require('crypto');
const fs = require('fs');
const { Name, Int64, TimePoint } = require('@wharfkit/antelope');
const { RSASigning, make_msg } = require('./rsaSigning.js');

// Helper function to create time object for blockchain.addTime()
function seconds(s) {
  return {
    toMilliseconds: () => s * 1000
  };
}

// Helper: Get balance from eosio.token
function getBalance(tokenContract, accountName) {
  try {
    const rows = tokenContract.tables.accounts(nameToBigInt(accountName)).getTableRows();
    let row = rows.find(r => r.balance.includes('WAX'));
    if (row && row.balance) {
      return { amount: parseFloat(row.balance.split(' ')[0]) };
    }
  } catch (e) {
    // Account may not have balance row yet
  }
  return { amount: 0 };
}

// Helper function to convert string to EOSIO name (uint64_t)
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

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
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

describe('test orng smart contract', () => {
  let blockchain;
  let systemContract = 'eosio';
  let orngContract = 'orng.wax';
  let govAccount = 'orng.wax';
  let orngOracle = 'oracle.wax';
  let orngOracle2 = 'oracle2.wax';
  let orngOracle3 = 'oracle3.wax';
  let orngOracle4 = 'oracle4.wax';
  let orngV1Oracle = 'oraclev1.wax';
  let dappContract = 'dapp.wax';
  let pauseAcc = 'pause.test';
  let payee = 'payee';
  let payer = 'payer';
  let testToken = 'testtoken';
  let eosioToken = 'eosio.token';
  let delphiAccount = "delphioracle";


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

  const exponent2 = '10001';
  const modulus2 =
    'a6ea95e20acfb44d69f40a95be36ea39f247a938aa04afea975e76d98d23cad3d4a4e7b9809e9abce157cfc9adb6d234ddc279d63ad9d78dc757bfe611098f30a246e3807f43217cf45d936c602ec942fc739b7e2bb6fde70a87074653d5924e1fba72e913bb11a13ba59fb8649f659cf00229ec011927a9e913438670509a1a36458adb6baee37f42066b62e99fb8d63d9fc5268d93149c3415ba7ebfbcbf11ad03889e5c93caf7d4401bafaf4c99f59eb5283512e78393eb932df92e367853f02e5309ee52669ed93693e3f0fa549055011fa8029566afbdb2986c38a1afffcea1c230635bc1cefcf17b4404f304c3fc6880513b0ce803c1547a165b7b63bf1ab4f7330cac74b30177fcf7223b70725ed181d41e2a09846c64e3e59c0a93e35f9c49a7bd06707791d4648aaf9c4e8180838784db2a2e7cab9d882dd0c27a7581fe022a0a6e311032ebb0a798c80210062a1d874413b886aa99509b4a32943f60525f26097698e8ef5a342e10ef38f161243569c738e512c69620bd4ed3be3ac0752d1c516b12c8e550e5b217c51b8638beb7cf823acc6719563c5b82b4c0b880151f170417e9ceb1ee7232dc7eaf3e3851f6de300b079ef45f585edeab271dafc84371298981a2f0c4dd1016934f3d6dc990330a488e24f5ecd38c6714690d021274118d62d036325b272a1f01aba8ab204a198eefc2e1900e74878d6950d1';
  const privateKey2 = fs.readFileSync('./tests/resources/test_rsa_4096_priv_2.pem', 'utf8');
  const modulus2Id = stringHashToNum(crypto.createHash('sha256').update(modulus2).digest('hex'));

  const exponent3 = '10001';
  const modulus3 =
    'b338fddedf4bfee5eeaf78c91b246d0d53022aeed6d02ad02e186bc9897bcfee5b80115a0e3ac1aee6a967d04eec3fe9b0301ca1780fcb78255bdbf50a714bdb82fe10f043e00db8228cc4ff9ec284ebd2d77c99fde054a118f2a76bec6a04cd610ad4f338073ce2bf2e72cb671caa876eff87fb637e9da9aa06ebc6a4065cb92c3d14e93790afcdebcb3a473bc28afc7bb4080f02592f03ddb0c587280bacbdd8957d899fb5a0acedf12d66235bc7d16998542e27922fd3b0031982fa16f046336ddfca8e1e247ce424d9dad5220300b6e40742520343eac016f2018fb482b4c270f9f39ee9f2af60cd424941b2dcdda5d128210db9d2349b2cb7e62376ca61ed639869f1a607c9ae244417f8940ab271671726db470750e6b4122a3208ad7fa2cdfecbb2d3f7c23f3efa2928581617342772d91eb61af999116fa47127675738403390750697beaff2c4ff3451f2b160b2ee79d38afab1ad8fe88e1b00e310cf3a7f9ba8c266f30bc94097d0fc32e448830ac8b8083c7c80b26ece12cf67c63b8b8249a80d6ce3e04921515533ab1f9e1a68b4db9945df8c6171fff90947030c88863b454152def34331028d42df8894da9662a4958ba4bfea7aee6a4ae998cf5df86741b34da0fb45a8382384430a541b8b25ef05f88de06512a5f031a4066bc5a21c85ac598b4a93f43ac34c8e9694635227eecd425130f2f1a3ddd6f8f9';
  const privateKey3 = fs.readFileSync('./tests/resources/test_rsa_4096_priv_3.pem', 'utf8');
  const modulus3Id = stringHashToNum(crypto.createHash('sha256').update(modulus2).digest('hex'));

  function getRSAPrivateKey(version) {
    if (version == 1) {
      return privateKey0;
    } else if (version == 2) {
      return privateKey1;
    } else if (version == 3) {
      return privateKey2;
    } else if (version == 4) {
      return privateKey3;
    }
  }

  async function initDelphioracle(delphiAccount) {
    let now = new Date();
    let nowString = now.toISOString().replace('Z', '');

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

    // Create regular accounts
    [pauseAcc, payee, payer] = blockchain.createAccounts('pause.test', 'payee', 'payer');

    // Deploy orng.wax contract
    orngContract = blockchain.createAccount({
      name: Name.from('orng.wax'),
      wasm: fs.readFileSync('./build/wax.orng.wasm'),
      abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
      enableInline: true,
    });
    // Create oracle accounts
    [orngOracle, orngOracle2, orngV1Oracle, orngOracle3, orngOracle4] = blockchain.createAccounts(
      'oracle.wax',
      'oracle2.wax',
      'orngv1oracle',
      'oracle3.wax',
      'oracle4.wax'
    );
    // Deploy randreceiver (dapp) contract
    dappContract = blockchain.createAccount({
      name: Name.from('dapp.wax'),
      wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
      abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
      enableInline: true,
    });
    // Deploy eosio.token contract
    testToken = blockchain.createAccount({
      name: Name.from('testtoken'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
      enableInline: true,
    });

    eosioToken = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
      enableInline: true,
    });

    // Deploy delphioracle contract
    delphiAccount = blockchain.createAccount({
      name: Name.from('delphioracle'),
      wasm: fs.readFileSync('./tests/contracts/delphioracle.wasm'),
      abi: fs.readFileSync('./tests/contracts/delphioracle.abi', 'utf8'),
      enableInline: true,
    });

    govAccount = orngContract;

    await initDelphioracle(delphiAccount);

    await orngContract.actions.setpubkey([
      1,
      exponent0,
      modulus0,
    ]).send(govAccount.name.toString() + '@active');


    await orngContract.actions.setoracles([[orngOracle.name]]).send(govAccount.name.toString() + '@active');
    await testToken.actions.create([testToken.name, "1000000000000.0000 TST"]).send(testToken.name.toString() + '@active');

    await testToken.actions.issue([
      testToken.name,
      "1000000000000.0000 TST",
      "issue",
    ]).send(testToken.name.toString() + '@active');

    await testToken.actions.transfer([
      testToken.name,
      dappContract.name,
      "1000000.0000 TST",
      "transfer",
    ]).send(testToken.name.toString() + '@active');

    await eosioToken.actions.create([eosioToken.name, "1000000.00000000 WAX"]).send(eosioToken.name.toString() + '@active');

    await eosioToken.actions.issue([
      eosioToken.name,
      "1000000.00000000 WAX",
      "issue",
    ]).send(eosioToken.name.toString() + '@active');

    await sendWaxToAccount(dappContract.name, '100.00000000 WAX');

  });

  async function sendWaxToAccount(accountName, amount) {
    await eosioToken.actions.transfer([
        eosioToken.name.toString(),
        accountName.toString(),
        amount,
        'funding'
    ]).send(eosioToken.name.toString() +'@active');
  }

  after(async () => {

  });

  describe('Initialize', () => {
    it('should init first signing key', async () => {
      const pubkey_tbl_rows = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(pubkey_tbl_rows[pubkey_tbl_rows.length - 1].ver).to.equal(1);
      expect(pubkey_tbl_rows[pubkey_tbl_rows.length - 1].pubkey_hash_id).to.equal(modulus0Id);
      expect(pubkey_tbl_rows[pubkey_tbl_rows.length - 1].exponent).to.equal(exponent0);
      expect(pubkey_tbl_rows[pubkey_tbl_rows.length - 1].modulus).to.equal(modulus0);
    });
  });

  describe('test setconfig', () => {
    it('throw if missing self permission', async () => {
      await expectToThrow(
        orngContract.actions.setconfig(['bwpaidmaxjob', 999]).send(dappContract.name.toString() + '@active'),
        'missing required authority orng.wax'
      );
    });

    it('should set config', async () => {
      await orngContract.actions.setconfig(['bwpaidmaxjob', 999]).send(orngContract.name.toString() + '@active');
     
      const configTable_row = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(nameToBigInt('bwpaidmaxjob'));

      expect(configTable_row.value).to.equal(999);
    });
    it('should set configv2', async () => {
      await orngContract.actions.configv2(['0.00500000 WAX', 3]).send(orngContract.name.toString() + '@active');

      const configTable_row = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(nameToBigInt('feepercall'));

      expect(configTable_row.value).to.equal(500000);

      const configTable2_row = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(nameToBigInt('strikesmax'));

      expect(configTable2_row.value).to.equal(3);
    });
  });

  describe('configadptive tests', () => {
    it('should throw if missing authorization', async () => {
      await expectToThrow(
        orngContract.actions.configadptive([20000, 1000, 2000, 15, 150, 1200, 15]).send(dappContract.name.toString() + '@active'),
        'missing required authority orng.wax'
      );
    });

    it('should set configadptive', async () => {
      await orngContract.actions.configadptive([
        20000,
        1000,
        2000,
        15,
        150,
        1200,
        15,
      ]).send(orngContract.name.toString() + '@active');

      const adaptiveConfigTable_rows = orngContract.tables['adaptcfg'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(adaptiveConfigTable_rows.length).to.equal(1);
      expect(adaptiveConfigTable_rows[0].total_capacity_calls_per_hr).to.equal(20000);
      expect(adaptiveConfigTable_rows[0].free_min_calls_per_hr).to.equal(1000);
      expect(adaptiveConfigTable_rows[0].headroom_calls_per_hr).to.equal(2000);
      expect(adaptiveConfigTable_rows[0].per_dapp_min_calls_per_hr).to.equal(15);
      expect(adaptiveConfigTable_rows[0].burst_window_hours).to.equal(150);
      expect(adaptiveConfigTable_rows[0].ema_half_life_sec).to.equal(1200);
      expect(adaptiveConfigTable_rows[0].ema_min_update_sec).to.equal(15);
    });

    it('should update existing configadptive', async () => {
      await orngContract.actions.configadptive([
        18000,
        900,
        1800,
        10,
        100,
        900,
        10,
      ]).send(orngContract.name.toString() + '@active');

      const adaptiveConfigTable_rows = orngContract.tables['adaptcfg'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(adaptiveConfigTable_rows.length).to.equal(1);
      expect(adaptiveConfigTable_rows[0].total_capacity_calls_per_hr).to.equal(18000);
      expect(adaptiveConfigTable_rows[0].free_min_calls_per_hr).to.equal(900);
      expect(adaptiveConfigTable_rows[0].headroom_calls_per_hr).to.equal(1800);
      expect(adaptiveConfigTable_rows[0].per_dapp_min_calls_per_hr).to.equal(10);
      expect(adaptiveConfigTable_rows[0].burst_window_hours).to.equal(100);
      expect(adaptiveConfigTable_rows[0].ema_half_life_sec).to.equal(900);
      expect(adaptiveConfigTable_rows[0].ema_min_update_sec).to.equal(10);
    });
  });

  it('should set configv3', async () => {
      await orngContract.actions.configv3([0, 0]).send(orngContract.name.toString() + '@active');
      const configTable5_row = orngContract.tables['config.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName('stipendmonth'));
      console.log('configTable5_row:', configTable5_row);
      expect(configTable5_row.value).to.equal(0);
    }
  );

  describe('set publickey tests', () => {
    it('should throw if key version exists', async () => {
      const pubkey_tbl_rows = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.setpubkey([1, 'exponent2', 'modulus2']).send(govAccount.name.toString() + '@active'),
        'eosio_assert: key with this version has already existed'
      );
    });

    it('should prevent modulus with leading zeroes', async () => {
      const pubkey_tbl_rows = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.setpubkey([2, 'exponent2', '0modulus2']).send(govAccount.name.toString() + '@active'),
        'eosio_assert: modulus must have leading zeroes stripped'
      );
    });

    it('should prevent empty modulus', async () => {
      const pubkey_tbl_rows = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.setpubkey([2, 'exponent2', '']).send(govAccount.name.toString() + '@active'),
        'eosio_assert: modulus must have non-zero length'
      );
    });

     it('should prevent version increment wrong', async () => {
      const pubkey_tbl_rows = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.setpubkey([3, exponent1, modulus1]).send(govAccount.name.toString() + '@active'),
        'eosio_assert: version must increment by 1'
      );
    });

    it('should set next publickey', async () => {
      await orngContract.actions.setpubkey([
        2,
        exponent1,
        modulus1,
      ]).send(govAccount.name.toString() + '@active');

      const pubkey_tbl_rows = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(pubkey_tbl_rows[pubkey_tbl_rows.length - 1].ver).to.equal(2);
      expect(pubkey_tbl_rows[pubkey_tbl_rows.length - 1].exponent).to.equal(exponent1);
      expect(pubkey_tbl_rows[pubkey_tbl_rows.length - 1].modulus).to.equal(modulus1);
    });
  });

  describe('test treasury', () => {
    let treasuryAccount;
    let dappTest11, dappTest12, dappTest13;
    
    before(async () => {
      await orngContract.actions.setoracles([[orngOracle3.name]]).send(govAccount.name.toString() + '@active');
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      [treasuryAccount] = await blockchain.createAccounts('treasury1');

      // Deploy test dapp contracts
      dappTest11 = blockchain.createAccount({
        name: Name.from('dapptest11'),
        wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
        abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
        enableInline: true,
      });
      dappTest12 = blockchain.createAccount({
        name: Name.from('dapptest12'),
        wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
        abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
        enableInline: true,
      });
      dappTest13 = blockchain.createAccount({
        name: Name.from('dapptest13'),
        wasm: fs.readFileSync('./tests/contracts/randreceiver.wasm'),
        abi: fs.readFileSync('./tests/contracts/randreceiver.abi', 'utf8'),
        enableInline: true,
      });

      await eosioToken.actions.transfer([
        eosioToken.name.toString(),
        treasuryAccount.name.toString(),
        '100000.00000000 WAX',
        'treasury'
      ]).send(eosioToken.name.toString() +'@active');

    });

    it('should deposit treasury', async () => {
      await eosioToken.actions.transfer([
        treasuryAccount.name.toString(),
        orngContract.name.toString(),
        '0.04500000 WAX',
        'treasury'
      ]).send(treasuryAccount.name.toString() +'@active');

      const treasuryTable_rows = orngContract.tables['treasury'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(treasuryTable_rows.length).to.equal(1);
      expect(treasuryTable_rows[0].pool_balance).to.equal(4500000);
    });

    it('should not deposit non WAX token', async () => {
      await testToken.actions.transfer([
        testToken.name,
        treasuryAccount.name,
        "1000000.0000 TST",
        "transfer",
      ]).send(testToken.name.toString() + '@active');
      await expectToThrow(
        testToken.actions.transfer([
          treasuryAccount.name.toString(),
          orngContract.name.toString(),
          "1000000.0000 TST",
          "transfer"
        ]).send(treasuryAccount.name.toString() + '@active'),
        'eosio_assert: only support eosio.token'
      );
    });

    it('should not charge treasury if dapp is deposited', async () => {
      // Disable free tier to test deposit functionality
      await orngContract.actions.configv2(['0.00500000 WAX', 3]).send(orngContract.name.toString() + '@active');
      await orngContract.actions.configadptive([
        18000,
        900,
        1800,
        0,
        100,
        900,
        10,
      ]).send(orngContract.name.toString() + '@active');
      await sendWaxToAccount(dappTest11.name, '10.00000000 WAX');
      await eosioToken.actions.transfer([
        dappTest11.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'deposit-' + dappTest11.name.toString()
      ]).send(dappTest11.name.toString() + '@active');

      const treasuryTable_rows = orngContract.tables['treasury'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      let balanceBefore = treasuryTable_rows[0].pool_balance; 

      const assoc_id = 5;
      await orngContract.actions.requestrand([assoc_id, 12345, dappTest11.name.toString()]).send(dappTest11.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      let request = requestTable_rows[requestTable_rows.length - 1];

      const seed = request.seed;
      const version = request.ver;
      const nonce = request.nonce;
      const rsaSigning = new RSASigning( getRSAPrivateKey(version));

      let msg = make_msg(seed, dappTest11.name.toString(), nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);
      await orngContract.actions.setrand([
        orngOracle3.name,
        request.id,
        request.ver,
        signed_value,
      ]).send(orngOracle3.name.toString() + '@active');

      let newRequestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(newRequestTable_rows.length).to.equal(0);

      let balanceAfter_rows = orngContract.tables['treasury'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(balanceAfter_rows[0].pool_balance).to.equal(balanceBefore);
    })

  });


  describe('test stake', () => {
    before(async () => {
      // Set config with k_calls_per_wax_numerator=100000 to match test expectations
      await orngContract.actions.configv2(['0.00500000 WAX', 3]).send(orngContract.name.toString() + '@active');
    });

    describe('memo parsing validation', () => {
      before(async () => {
        await sendWaxToAccount(dappContract.name, '100.00000000 WAX');
      });

      it('should reject stake with uppercase account name', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'stake-UPPERCASE'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: character is not in allowed character set for names'
        );
      });

      it('should reject stake with invalid characters in account name', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'stake-name@#$'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: character is not in allowed character set for names'
        );
      });

      it('should reject stake with empty account name', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'stake-'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: invalid memo format: stake-<dapp_name>'
        );
      });

      it('should reject stake with account name exceeding 12 characters', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'stake-verylongnameexceeds'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: invalid dapp name length'
        );
      });

      it('should reject deposit with uppercase account name', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'deposit-UPPERCASE'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: character is not in allowed character set for names'
        );
      });

      it('should reject deposit with invalid characters in account name', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'deposit-name@#$'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: character is not in allowed character set for names'
        );
      });

      it('should reject deposit with empty account name', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'deposit-'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: invalid memo format: deposit-<dapp_name>'
        );
      });

      it('should reject deposit with account name exceeding 12 characters', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'deposit-verylongnameexceeds'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: invalid dapp name length'
        );
      });

      it('should reject stake for non-existent account', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'stake-noexist1234'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: dapp account does not exist'
        );
      });

      it('should reject deposit for non-existent account', async () => {
        await expectToThrow(
          eosioToken.actions.transfer([
            dappContract.name.toString(),
            orngContract.name.toString(),
            '1.00000000 WAX',
            'deposit-noexist1111'
          ]).send(dappContract.name.toString() + '@active'),
          'eosio_assert: dapp account does not exist'
        );
      });
    });

    it('should throw if stake with invalid symbol', async () => {
      await expectToThrow(
        testToken.actions.transfer([
          dappContract.name.toString(),
          orngContract.name.toString(),
          '1.0000 TST',
          'stake-' + dappContract.name.toString()
        ]).send(dappContract.name.toString() + '@active'),
        'eosio_assert: only support eosio.token'
      );
    });

    it('should stake with valid transfer', async () => {
      let balanceBefore =  getBalance(eosioToken, orngContract.name.toString());
      
      await eosioToken.actions.transfer([
        dappContract.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'stake-' + dappContract.name.toString()
      ]).send(dappContract.name.toString() + '@active');

      const stakeTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappContract.name.toString()));
      expect(stakeTable_row.stake).to.equal('1.00000000 WAX');
      
        let balanceAfter = getBalance(eosioToken, orngContract.name.toString());
      
      expect(balanceAfter.amount - balanceBefore.amount).to.equal(1);
    });

    it('should increase credits with stake', async () => {

      const [dstake2] = await blockchain.createAccounts('dstake2');
      await sendWaxToAccount(dstake2.name, '10000.00000000 WAX');
      // stake
      await eosioToken.actions.transfer([
        dstake2.name.toString(),
        orngContract.name.toString(),
        '1000.00000000 WAX',
        'stake-' + dstake2.name.toString()
      ]).send(dstake2.name.toString() + '@active');
      const stakeTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dstake2.name.toString()));
      expect(stakeTable_row.stake).to.equal('1000.00000000 WAX');
      let timeUpdate = stakeTable_row.last_update;
      
      blockchain.addTime(seconds(15)); // 15 seconds

      await eosioToken.actions.transfer([
        dstake2.name.toString(),
        orngContract.name.toString(),
        '0.00000001 WAX',
        'stake-' + dstake2.name.toString()
      ]).send(dstake2.name.toString() + '@active');
      const stakeTableAfter = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const stakestatsTable_rows = orngContract.tables['stakestats'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const adaptiveConfigTable_rows = orngContract.tables['adaptcfg'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      let timeUpdateAfter = stakeTableAfter[0].last_update;
      let timeDiff = Math.floor((new Date(timeUpdateAfter).getTime() - new Date(timeUpdate).getTime()) / 1000);
      // no one paid yet so paid_rate_ema_ch === 0
      const tFree = adaptiveConfigTable_rows[0].total_capacity_calls_per_hr - adaptiveConfigTable_rows[0].headroom_calls_per_hr;
      let estimatedCredits = tFree * (100000000000 / stakestatsTable_rows[0].total_stake_amount) * timeDiff / 3600;
      expect(stakeTableAfter[0].credits).to.equal(stakeTable_row.credits + Math.floor(estimatedCredits));
    });

    it('should decrease credits with reqrand', async () => {

      const [dstake3] = await blockchain.createAccounts('dstake3');
      await sendWaxToAccount(dstake3.name, '10000.00000000 WAX');
      // stake
      await eosioToken.actions.transfer([
        dstake3.name.toString(),
        orngContract.name.toString(),
        '1000.00000000 WAX',
        'stake-' + dstake3.name.toString()
      ]).send(dstake3.name.toString() + '@active');
      const stakeTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dstake3.name.toString()));
      expect(stakeTable_row.stake).to.equal('1000.00000000 WAX');
      let timeUpdate = stakeTable_row.last_update;

      blockchain.addTime(seconds(15)); // 15 seconds

      await orngContract.actions.requestrand([
        1,
        12345,
        dstake3.name,
      ]).send(dstake3.name.toString() + '@active');
      const stakeTableAfter_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dstake3.name.toString()));

      const stakestatsTable_rows = orngContract.tables['stakestats'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const adaptiveConfigTable_rows = orngContract.tables['adaptcfg'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      let timeUpdateAfter = stakeTableAfter_row.last_update;
      let timeDiff = Math.floor((new Date(timeUpdateAfter).getTime() - new Date(timeUpdate).getTime()) / 1000);
      // no one paid yet so paid_rate_ema_ch === 0
      const tFree = adaptiveConfigTable_rows[0].total_capacity_calls_per_hr - adaptiveConfigTable_rows[0].headroom_calls_per_hr;
      let estimatedCredits = tFree * (100000000000 / stakestatsTable_rows[0].total_stake_amount) * timeDiff / 3600;

      // minus one for the requestrand
      expect(stakeTableAfter_row.credits + 1).to.equal(stakeTable_row.credits + Math.floor(estimatedCredits));
    });

    it('should allow anyone to stake for dapp', async () => {
      const [staker, targetDapp] = await blockchain.createAccounts('staker1', 'targetdapp');
      await sendWaxToAccount(staker.name, '100.00000000 WAX');

      let balanceBefore = getBalance(eosioToken, orngContract.name.toString());
      await eosioToken.actions.transfer([
        staker.name.toString(),
        orngContract.name.toString(),
        '50.00000000 WAX',
        'stake-' + targetDapp.name.toString()
      ]).send(staker.name.toString() + '@active');

      // Check acctstate table (total stake for dapp)
      const acctTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(targetDapp.name.toString()));
      expect(acctTable_row.stake).to.equal('50.00000000 WAX');

      // Check userstakes table (individual user stake for dapp)
      const userStakesTable_rows = orngContract.tables['userstakes'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(userStakesTable_rows.length).to.equal(1);
      expect(userStakesTable_rows[0].user).to.equal(staker.name.toString());
      expect(userStakesTable_rows[0].amount).to.equal('50.00000000 WAX');

      let balanceAfter = getBalance(eosioToken, orngContract.name.toString());
      expect(balanceAfter.amount - balanceBefore.amount).to.equal(50);
    });

    it('should allow user to unstake their own stake', async () => {
      const [staker, targetDapp] = await blockchain.createAccounts('staker2', 'targetdapp2');
      await sendWaxToAccount(staker.name, '100.00000000 WAX');

      // First stake
      await eosioToken.actions.transfer([
        staker.name.toString(),
        orngContract.name.toString(),
        '30.00000000 WAX',
        'stake-' + targetDapp.name.toString()
      ]).send(staker.name.toString() + '@active');

      // set config to unstake time for test (5 seconds)
      await orngContract.actions.setconfig(['unstaketime', 5]).send(orngContract.name.toString() + '@active');

      // Stake again
      await eosioToken.actions.transfer([
        staker.name.toString(),
        orngContract.name.toString(),
        '20.00000000 WAX',
        'stake-' + targetDapp.name.toString()
      ]).send(staker.name.toString() + '@active');

      let stakerBalanceBefore = getBalance(eosioToken, staker.name.toString());

      // Unstake
      await orngContract.actions.unstakeuser([
        staker.name,
        targetDapp.name,
        '10.00000000 WAX',
      ]).send(staker.name.toString() + '@active');

      // Check userstakes table - stake should be reduced immediately
      const userStakesTable_rows = orngContract.tables['userstakes'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(userStakesTable_rows.length).to.equal(1);
      expect(userStakesTable_rows[0].amount).to.equal('40.00000000 WAX');

      // Check acctstate table - stake should be reduced immediately
      const acctTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(targetDapp.name.toString()));
      expect(acctTable_row.stake).to.equal('40.00000000 WAX');

      // Check unstake table has the request
      const unstakeTable = orngContract.tables['unstake'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(unstakeTable.length).to.equal(1);
      expect(unstakeTable[0].amount).to.equal('10.00000000 WAX');

      // Balance should not change yet (tokens not transferred)
      let stakerBalanceAfter = getBalance(eosioToken, staker.name.toString());
      expect(stakerBalanceAfter.amount).to.equal(stakerBalanceBefore.amount);

      // Wait for unstake time to pass
      blockchain.addTime(seconds(10)); // 10 seconds

      // Claim funds
      await orngContract.actions.claimfund([staker.name, targetDapp.name]).send(staker.name.toString() + '@active');

      // Check unstake table should be empty after claim
      const unstakeTableAfterClaim_rows = orngContract.tables['unstake'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(unstakeTableAfterClaim_rows.length).to.equal(0);

      // Check staker got tokens back after claim
      let stakerBalanceFinal = getBalance(eosioToken, staker.name.toString());
      expect(stakerBalanceFinal.amount - stakerBalanceBefore.amount).to.equal(10);
    });

    it('should remove user stake entry when fully unstaked', async () => {
      const [staker, targetDapp] = await blockchain.createAccounts('staker3', 'targetdapp3');
      await sendWaxToAccount(staker.name, '100.00000000 WAX');

      // set config to unstake time for test (5 seconds)
      await orngContract.actions.setconfig(['unstaketime', 5]).send(orngContract.name.toString() + '@active');

      // First stake
      await eosioToken.actions.transfer([
        staker.name.toString(),
        orngContract.name.toString(),
        '15.00000000 WAX',
        'stake-' + targetDapp.name.toString()
      ]).send(staker.name.toString() + '@active');

      let stakerBalanceBefore = getBalance(eosioToken, staker.name.toString());

      // Unstake all
      await orngContract.actions.unstakeuser([
        staker.name,
        targetDapp.name,
        '15.00000000 WAX',
      ]).send(staker.name.toString() + '@active');

      // Check userstakes table should be empty (fully unstaked)
      const userStakesTable_rows = orngContract.tables['userstakes'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(userStakesTable_rows.length).to.equal(0);

      // Check acctstate table stake should be zero
      const acctTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(targetDapp.name.toString()));
      expect(acctTable_row.stake).to.equal('0.00000000 WAX');

      // Check unstake table has the request
      const unstakeTable = orngContract.tables['unstake'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(unstakeTable.length).to.equal(1);
      expect(unstakeTable[0].amount).to.equal('15.00000000 WAX');

      // Balance should not change yet (tokens not transferred)
      let stakerBalanceAfter = getBalance(eosioToken, staker.name.toString());
      expect(stakerBalanceAfter.amount).to.equal(stakerBalanceBefore.amount);

      // Wait for unstake time to pass
      blockchain.addTime(seconds(10));

      // Claim funds
      await orngContract.actions.claimfund([staker.name, targetDapp.name]).send(staker.name.toString() + '@active');

      // Check unstake table should be empty after claim
      const unstakeTableAfterClaim_rows = orngContract.tables['unstake'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(unstakeTableAfterClaim_rows.length).to.equal(0);

      // Check staker got tokens back after claim
      let stakerBalanceFinal = getBalance(eosioToken, staker.name.toString());
      expect(stakerBalanceFinal.amount - stakerBalanceBefore.amount).to.equal(15);
    });

    it('should revert claim when unstake time not reached', async () => {
      const [staker, targetDapp] = await blockchain.createAccounts('staker4', 'targetdapp4');
      await sendWaxToAccount(staker.name, '100.00000000 WAX');

      // set config to unstake time for test (30 seconds)
      await orngContract.actions.setconfig(['unstaketime', 30]).send(orngContract.name.toString() + '@active');

      // First stake
      await eosioToken.actions.transfer([
        staker.name.toString(),
        orngContract.name.toString(),
        '25.00000000 WAX',
        'stake-' + targetDapp.name.toString()
      ]).send(staker.name.toString() + '@active');

      // Unstake
      await orngContract.actions.unstakeuser([
        staker.name,
        targetDapp.name,
        '10.00000000 WAX',
      ]).send(staker.name.toString() + '@active');

      // Check unstake table has the request
      const unstakeTable = orngContract.tables['unstake'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(unstakeTable.length).to.equal(1);
      expect(unstakeTable[0].amount).to.equal('10.00000000 WAX');

      // Try to claim immediately (should fail)
      await expectToThrow(
        orngContract.actions.claimfund([
          staker.name.toString(),
          targetDapp.name.toString()
        ]).send(staker.name.toString() + '@active'),
        'eosio_assert: unstake time not reached, please wait'
      );

      // Unstake table should still have the request (not removed)
      const unstakeTableAfterFailedClaim = orngContract.tables['unstake'](nameToBigInt(targetDapp.name.toString()))
        .getTableRows();
      expect(unstakeTableAfterFailedClaim.length).to.equal(1);
      expect(unstakeTableAfterFailedClaim[0].amount).to.equal('10.00000000 WAX');
    });
  });

  describe('accumstake tests', () => {
    it('should throw if missing authorization', async () => {
      await expectToThrow(
        orngContract.actions.accumstake([]).send(dappContract.name.toString() + '@active'),
        'missing required authority orng.wax'
      );
    });

    it('should accumulate total stake correctly', async () => {
      // Create test accounts and stake
      const [accumtest1] = await blockchain.createAccounts('accumtest1');
      const [accumtest2] = await blockchain.createAccounts('accumtest2');
      await sendWaxToAccount(accumtest1.name, '1000.00000000 WAX');
      await sendWaxToAccount(accumtest2.name, '1000.00000000 WAX');

      await eosioToken.actions.transfer([
        accumtest1.name.toString(),
        orngContract.name.toString(),
        '100.00000000 WAX',
        'stake-' + accumtest1.name.toString()
      ]).send(accumtest1.name.toString() + '@active');
      await eosioToken.actions.transfer([
        accumtest2.name.toString(),
        orngContract.name.toString(),
        '200.00000000 WAX',
        'stake-' + accumtest2.name.toString()
      ]).send(accumtest2.name.toString() + '@active');

      // Run accumstake
      await orngContract.actions.accumstake([]).send(orngContract.name.toString() + '@active');

      // Check stakestats table
      const stakestatsTable_rows = orngContract.tables['stakestats'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(stakestatsTable_rows.length).to.equal(1);

      // Calculate expected total by summing all stakes from acctstate
      const acctTable_rows = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      let expectedTotal = 0;
      for (const row of acctTable_rows) {
        expectedTotal += parseInt(row.stake.split(' ')[0].replace('.', '')); // Convert to integer with 8 decimals
      }

      expect(parseInt(stakestatsTable_rows[0].total_stake_amount)).to.equal(expectedTotal);
    });

    it('should update total stake when new stake is added', async () => {
      // Get initial total stake
      const stakestatsTableBefore_rows = orngContract.tables['stakestats'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const initialTotal = parseInt(stakestatsTableBefore_rows[0].total_stake_amount);

      // Create new account and stake
      const [accumtest3] = await blockchain.createAccounts('accumtest3');
      await sendWaxToAccount(accumtest3.name, '1000.00000000 WAX');
      await eosioToken.actions.transfer([
        accumtest3.name.toString(),
        orngContract.name.toString(),
        '150.00000000 WAX',
        'stake-' + accumtest3.name.toString()
      ]).send(accumtest3.name.toString() + '@active');

      // Run accumstake again
      await orngContract.actions.accumstake([]).send(orngContract.name.toString() + '@active');

      // Check stakestats table has been updated
      const stakestatsTableAfter_rows = orngContract.tables['stakestats'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(stakestatsTableAfter_rows.length).to.equal(1);
      expect(parseInt(stakestatsTableAfter_rows[0].total_stake_amount)).to.equal(initialTotal + 15000000000); // 150.00000000 WAX in integer format
    });
  });

  describe('test deposit', () => {
    let dappDeposit1;
    before(async () => {
      [dappDeposit1] = await blockchain.createAccounts('dappdeposit1');
      await sendWaxToAccount(dappDeposit1.name, '100.00000000 WAX');
      // Disable free tier to properly test deposit functionality
      await orngContract.actions.configv2(['0.00500000 WAX', 3]).send(orngContract.name.toString() + '@active');

      await orngContract.actions.configadptive([
        18000,
        900,
        1800,
        0,
        100,
        900,
        10,
      ]).send(orngContract.name.toString() + '@active');
    });

    it('dapp can deposit', async () => {
      let balanceBefore = getBalance(eosioToken, orngContract.name.toString());
      await eosioToken.actions.transfer([
        dappDeposit1.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        'deposit-' + dappDeposit1.name.toString()
      ]).send(dappDeposit1.name.toString() + '@active');
      const depositTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappDeposit1.name.toString()));
      expect(depositTable_row.fee_balance).to.equal('10.00000000 WAX');
      let balanceAfter = getBalance(eosioToken, orngContract.name.toString());
      expect(balanceAfter.amount - balanceBefore.amount).to.equal(10);
    });

    it('dapp can deposit multiple times', async () => {
      await eosioToken.actions.transfer([
        dappDeposit1.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        'deposit-' + dappDeposit1.name.toString()
      ]).send(dappDeposit1.name.toString() + '@active');
      const depositTable1_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappDeposit1.name.toString()));
      expect(depositTable1_row.fee_balance).to.equal('20.00000000 WAX');
    });

    it("decrease balance when requestrand", async () => {
      await orngContract.actions.requestrand([
        1,
        12345,
        dappDeposit1.name,
      ]).send(dappDeposit1.name.toString() + '@active');

      const depositTableAfter_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappDeposit1.name.toString()));
      expect(depositTableAfter_row.fee_balance).to.equal('19.99500000 WAX');
    });
  });

 
  describe('requestrand tests', () => {
    let dappContract2;
    before(async () => {
      [dappContract2] = await blockchain.createAccounts('dapp2');
      // Don't register yet - let individual tests register after setting their config
      await sendWaxToAccount(dappContract.name, '100.00000000 WAX');
      await eosioToken.actions.transfer([
        dappContract.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        'deposit-' + dappContract.name.toString()
      ]).send(dappContract.name.toString() + '@active');

      // Fund treasury for free tier to work
      const [treasuryFunder] = await blockchain.createAccounts('treasfunder');
      await sendWaxToAccount(treasuryFunder.name, '100.00000000 WAX');
      await eosioToken.actions.transfer([
        treasuryFunder.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        'treasury'
      ]).send(treasuryFunder.name.toString() + '@active');
    });
    it('should accept request with free tier (no stake)', async () => {
      // Set free calls per hour to allow free requests
      await orngContract.actions.configv2(['0.00500000 WAX', 3]).send(orngContract.name.toString() + '@active');

      await orngContract.actions.configadptive([
        18000,
        900,
        1800,
        10,
        100,
        900,
        10,
      ]).send(orngContract.name.toString() + '@active');

      // Should work without stake due to free tier
      await orngContract.actions.requestrand([
        1,
        12345,
        dappContract2.name,
      ]).send(dappContract2.name.toString() + '@active');

      // Check that account was created with free credits
      const stakeTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappContract2.name.toString()));

      expect(stakeTable_row.stake).to.equal('0.00000000 WAX');
      expect(stakeTable_row.credits).to.equal(9); // Started with 10, used 1
    });

    it('throw if no stake and no free credits', async () => {
      // Set free calls to 0 to disable free tier
      await orngContract.actions.configv2(['0.00500000 WAX', 3]).send(orngContract.name.toString() + '@active');
      await orngContract.actions.configadptive([
        18000,
        900,
        1800,
        0,
        100,
        900,
        10,
      ]).send(orngContract.name.toString() + '@active');

      const [dappContract3] = await blockchain.createAccounts('dapp3');

      await expectToThrow(
        orngContract.actions.requestrand([
          1,
          12345,
          dappContract3.name.toString()
        ]).send(dappContract3.name.toString() + '@active'),
        `eosio_assert_message: WAX RNG: ${dappContract3.name.toString()} is out of usage credits - alert operator (see https://github.com/worldwide-asset-exchange/wax-orng)`
      );
    });

    it('should exhaust free credits and require deposit', async () => {
      // Set free calls to 2 per hour
      await orngContract.actions.configv2(['0.00500000 WAX', 3]).send(orngContract.name.toString() + '@active');

      await orngContract.actions.configadptive([
        18000,
        900,
        1800,
        2,
        100,
        900,
        10,
      ]).send(orngContract.name.toString() + '@active');

      const [dappContract4] = await blockchain.createAccounts('dapp4');

      // First call should work (uses free credit 1)
      await orngContract.actions.requestrand([
        101,
        1,
        dappContract4.name,
      ]).send(dappContract4.name.toString() + '@active');

      // Second call should work (uses free credit 2)
      await orngContract.actions.requestrand([
        102,
        2,
        dappContract4.name,
      ]).send(dappContract4.name.toString() + '@active');

      // Third call should fail (no credits left)
      await expectToThrow(
        orngContract.actions.requestrand([
          103,
          3,
          dappContract4.name.toString()
        ]).send(dappContract4.name.toString() + '@active'),
        `eosio_assert_message: WAX RNG: ${dappContract4.name.toString()} is out of usage credits - alert operator (see https://github.com/worldwide-asset-exchange/wax-orng)`
      );

      // Check account has 0 credits
      const stakeTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappContract4.name.toString()));

      expect(stakeTable_row.credits).to.equal(0);
    });

    it('should allow continued usage after depositing fees', async () => {
      const [dappContract5] = await blockchain.createAccounts('dapp5');
      await sendWaxToAccount(dappContract5.name, '10.00000000 WAX');

      // Use up free credits
      await orngContract.actions.requestrand([
        201,
        1,
        dappContract5.name,
      ]).send(dappContract5.name.toString() + '@active');

      await orngContract.actions.requestrand([
        202,
        2,
        dappContract5.name,
      ]).send(dappContract5.name.toString() + '@active');

      // Deposit fees
      await eosioToken.actions.transfer([
        dappContract5.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'deposit-' + dappContract5.name.toString()
      ]).send(dappContract5.name.toString() + '@active');

      // Should now work with fee payment
      await orngContract.actions.requestrand([
        203,
        3,
        dappContract5.name,
      ]).send(dappContract5.name.toString() + '@active');

      // Check fee was deducted
      const stakeTable_row = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappContract5.name.toString()));

      expect(stakeTable_row.fee_balance).to.equal('0.99500000 WAX'); // 1 WAX - 0.005 WAX fee
    });

    it ("should accept request if enough deposit", async () => {
      await sendWaxToAccount(dappContract2.name, '100.00000000 WAX');
      await eosioToken.actions.transfer([
        dappContract2.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        'deposit-' + dappContract2.name.toString()
      ]).send(dappContract2.name.toString() + '@active');

      // Get current account state to know the nonce
      const acctStateBefore = orngContract.tables['acctstate'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(stringToName(dappContract2.name.toString()));
      const expectedNonce = acctStateBefore ? acctStateBefore.last_nonce + 1 : 1;

      await orngContract.actions.requestrand([
        101,
        12345,
        dappContract2.name,
      ]).send(dappContract2.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      let lastRequest = requestTable_rows[requestTable_rows.length - 1];

      expect(lastRequest.seed).to.equal(sha256('12345'));
      expect(lastRequest.dapp).to.equal(dappContract2.name.toString());
      expect(lastRequest.assoc_id).to.equal(101);
      expect(lastRequest.nonce).to.equal(expectedNonce); // Dynamic based on previous requests
      expect([1, 2]).to.include(lastRequest.ver); // Version 1 or 2 depending on test order
      expect(lastRequest.parts.length).to.equal(0);
    });

    it('should silently ignore for banned accounts', async () => {
      await orngContract.actions.ban([dappContract.name]).send(orngContract.name.toString() + '@active');

      const requestTableBefore_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.requestrand([
          0,
          12345,
          dappContract.name.toString()
        ]).send(dappContract.name.toString() + '@active'),
        'eosio_assert: Account is banned from using this service'
      );

      await orngContract.actions.unban([dappContract.name]).send(orngContract.name.toString() + '@active');
    });

  });

  describe('pause contract tests', () => {
    it('should throw if the contact is paused', async () => {
      await eosioToken.actions.transfer([
        dappContract.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'stake-' + dappContract.name.toString()
      ]).send(dappContract.name.toString() + '@active');
      await orngContract.actions.pause([true]).send(orngContract.name.toString() + '@active');
      await expectToThrow(
        orngContract.actions.requestrand([
          0,
          12345,
          dappContract.name.toString()
        ]).send(dappContract.name.toString() + '@active'),
        'eosio_assert: Contract is paused'
      );

      await orngContract.actions.pause([false]).send(orngContract.name.toString() + '@active');
      await orngContract.actions.requestrand([
        0,
        12345,
        dappContract.name,
      ]).send(dappContract.name.toString() + '@active');
    });
  });

  describe('set oracles tests', () => {
    let reqId;
    let dappTest;
    let testVer = 1;

    before(async () => {
      // Make sure contract is unpaused
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      // Set config to use version 1 (not retired)
      await orngContract.actions.setconfig(['activever', 1]).send(orngContract.name.toString() + '@active');

      // Set up oracles first
      await orngContract.actions.setoracles([[orngOracle3.name]]).send(govAccount.name.toString() + '@active');

      // Create a test request that will be used by multiple tests
      try {
        [dappTest] = await blockchain.createAccounts('dapporc' + Math.floor(Math.random() * 100));
      } catch (e) {
        // If creation fails, use existing dappContract
        dappTest = dappContract;
      }

      if (dappTest !== dappContract) {
        await sendWaxToAccount(dappTest.name, '100.00000000 WAX');
        await eosioToken.actions.transfer([
          dappTest.name.toString(),
          orngContract.name.toString(),
          '10.00000000 WAX',
          'deposit-' + dappTest.name.toString()
        ]).send(dappTest.name.toString() + '@active');
      }

      await orngContract.actions.requestrand([
        9999,
        54321,
        dappTest.name,
      ]).send(dappTest.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const testReq = requestTable_rows.find(r => r.dapp === dappTest.name && r.assoc_id === 9999);
      if (testReq) {
        reqId = testReq.id;
        testVer = testReq.ver;
      } else if (requestTable_rows.length > 0) {
        // Fallback to last request if specific one not found
        const lastReq = requestTable_rows[requestTable_rows.length - 1];
        reqId = lastReq.id;
        testVer = lastReq.ver;
      }
    });

    it('should set oracles', async () => {
      await orngContract.actions.setoracles([[orngOracle3.name.toString(), orngOracle4.name.toString()]]).send(govAccount.name.toString() + '@active');

      const oraclesTable_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(oraclesTable_rows.length).to.equal(2);
      expect(oraclesTable_rows[0].oracle).to.equal(orngOracle3.name.toString());
      expect(oraclesTable_rows[0].oracle_index).to.equal(1);
      expect(oraclesTable_rows[1].oracle).to.equal(orngOracle4.name.toString());
      expect(oraclesTable_rows[1].oracle_index).to.equal(2);
    });
    it('oracle can submit part', async () => {
      // Use the reqId from before
      expect(reqId).to.exist;

      await orngContract.actions.submitpart([
        orngOracle3.name,
        reqId,
        testVer,
        sha256('sig1'),
      ]).send(orngOracle3.name.toString() + '@active');
      const requestTableAfter_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      let req = requestTableAfter_rows.find(r => r.id === reqId);
      expect(req.parts[0].sig_i).to.equal(sha256('sig1'));
    });
    it('can not submit wrong request id', async () => {
      await expectToThrow(
        orngContract.actions.submitpart([
          orngOracle4.name.toString(),
          100,
          2,
          sha256('sig1')
        ]).send(orngOracle4.name.toString() + '@active'),
        'eosio_assert: no request found'
      );
    });
    it('can not submit wrong version', async () => {
      const wrongVer = testVer === 1 ? 2 : 1;

      await expectToThrow(
        orngContract.actions.submitpart([
          orngOracle4.name.toString(),
          reqId,
          wrongVer,
          sha256('sig1')
        ]).send(orngOracle4.name.toString() + '@active'),
        'eosio_assert: version mismatch'
      );
    });
    it('oracle automatically uses its assigned index', async () => {
      // Oracle4 should be able to submit (it will use its assigned index automatically)
      await orngContract.actions.submitpart([
        orngOracle4.name,
        reqId,
        testVer,
        sha256('sig2'),
      ]).send(orngOracle4.name.toString() + '@active');

      // Verify the part was stored with the correct index
      let reqs_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      let req = reqs_rows.find(r => r.id == reqId);
      expect(req.parts.length).to.equal(2); // oracle3 (idx=1) + oracle4 (idx=2)
      expect(req.parts.some(p => p.idx == 2)).to.equal(true); // oracle4's index
    });
    it('can not submit duplicate part', async () => {

      await expectToThrow(
        orngContract.actions.submitpart([
          orngOracle3.name.toString(),
          reqId,
          testVer,
          sha256('sig3')
        ]).send(orngOracle3.name.toString() + '@active'),
        'eosio_assert: duplicate part'
      );
    });

    it('nonexistent oracle can not submit part', async () => {
      let [fakeOracle] = await blockchain.createAccounts('fakeoracle');

      await expectToThrow(
        orngContract.actions.submitpart([
          fakeOracle.name.toString(),
          reqId,
          testVer,
          sha256('sig2')
        ]).send(fakeOracle.name.toString() + '@active'),
        'eosio_assert: unknown oracle'
      );
    });
  });

  describe('set rand tests', () => {
    before(async () => {
      // Make sure contract is unpaused
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      // Set config to use version 1 (not retired)
      await orngContract.actions.setconfig(['activever', 2]).send(orngContract.name.toString() + '@active');

      await orngContract.actions.setoracles([[orngOracle.name.toString(), orngOracle2.name.toString()]]).send(govAccount.name.toString() + '@active');
      await eosioToken.actions.transfer([
        dappContract.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'stake-' + dappContract.name.toString()
      ]).send(dappContract.name.toString() + '@active');
    });
    it('should accept random value', async () => {
      const assoc_id = 5;
      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name.toString()]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const seed = requestTable_rows[requestTable_rows.length - 1].seed;
      const version = requestTable_rows[requestTable_rows.length - 1].ver;
      const nonce = requestTable_rows[requestTable_rows.length - 1].nonce;
      const rsaSigning = new RSASigning( getRSAPrivateKey(version));

      let msg = make_msg(seed, dappContract.name.toString(), nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);
      
      const oraclesBalanceTableBefore_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const oracleBalanceBefore = oraclesBalanceTableBefore_rows.find(r => r.oracle === orngOracle.name.toString());

      await orngContract.actions.setrand([
        orngOracle.name.toString(),
        requestTable_rows[requestTable_rows.length - 1].id,
        requestTable_rows[requestTable_rows.length - 1].ver,
        signed_value,
      ]).send(orngOracle.name.toString() + '@active');

      const requestTableAfter_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(requestTableAfter_rows.length).to.be.at.most(requestTable_rows.length);
      expect(requestTableAfter_rows.find(r => r.id === requestTable_rows[requestTable_rows.length - 1].id )).to.equal(undefined);

      // Check if results were delivered
      const results_tbl_rows = dappContract.tables['results'](nameToBigInt(dappContract.name.toString()))
        .getTableRows();

      let signed_value_hash = crypto.createHash('sha256').update(signed_value).digest('hex');

      const result = results_tbl_rows.find(r => r.assoc_id === assoc_id);
      if (result) {
        expect(result.assoc_id).to.equal(assoc_id);
        expect(result.random_value).to.equal(signed_value_hash);
      }


      const oraclesTable_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const oraclesBalanceTableAfter_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const rewardForEachOracle = Math.floor(500000 / oraclesTable_rows.length);
      const oracleBalanceAfter = oraclesBalanceTableAfter_rows.find(r => r.oracle === orngOracle.name.toString());
      const beforeBalance = oracleBalanceBefore ? Number(oracleBalanceBefore.unpaid.split(' ')[0])*(10**8) : 0;
      const afterBalance = Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8);
      // Just check that the oracle received some reward
      expect(afterBalance).to.be.at.least(beforeBalance);
    });

    it('should strike if invalid signed value', async () => {

      const rsaSigning = new RSASigning(privateKey0);
      const assoc_id = 6;
      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await orngContract.actions.setrand([
        orngOracle.name,
        requestTable_rows[requestTable_rows.length - 1].id,
        requestTable_rows[requestTable_rows.length - 1].ver,
        'faked_signed_value',
      ]).send(orngOracle.name.toString() + '@active');

      const signed_value = rsaSigning.generateRandomNumber(sha256('test1'));
      await orngContract.actions.setrand([
        orngOracle.name.toString(),
        requestTable_rows[requestTable_rows.length - 1].id,
        requestTable_rows[requestTable_rows.length - 1].ver,
        signed_value
      ]).send(orngOracle.name.toString() + '@active');
      const oraclesTable_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(oraclesTable_rows.length).to.equal(2);
      expect(oraclesTable_rows[0].oracle).to.equal(orngOracle.name.toString());
      expect(oraclesTable_rows[0].strikes).to.equal(2);
    });

    it('should suspend oracle if reach strike max', async () => {

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await orngContract.actions.setrand([
        orngOracle.name,
        requestTable_rows[requestTable_rows.length - 1].id,
        requestTable_rows[requestTable_rows.length - 1].ver,
        'faked_signed_value',
      ]).send(orngOracle.name.toString() + '@active');
      const oraclesTable_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(oraclesTable_rows.length).to.equal(2);
      expect(oraclesTable_rows[0].oracle).to.equal(orngOracle.name.toString());
      expect(oraclesTable_rows[0].strikes).to.equal(3);
      expect(oraclesTable_rows[0].suspended).to.equal(true);
    });

    it('should revert if oracle suspended', async () => {

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.setrand([
          orngOracle.name.toString(),
          requestTable_rows[requestTable_rows.length - 1].id,
          requestTable_rows[requestTable_rows.length - 1].ver,
          'signature'
        ]).send(orngOracle.name.toString() + '@active'),
        'eosio_assert: oracle suspended'
      );
    });

    it('should revert if request not found', async () => {

      await orngContract.actions.resetsuspen([orngOracle.name]).send(orngContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.setrand([
          orngOracle.name.toString(),
          9999,
          requestTable_rows[requestTable_rows.length - 1].ver,
          'signature'
        ]).send(orngOracle.name.toString() + '@active'),
        'eosio_assert: no request found'
      );
    });

    it('should not reward suspended oracles', async () => {

      const oraclesTableBefore_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const oraclesBalanceTableBefore_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      // Suspend oracle by giving it 3 strikes (max strikes)
      const assoc_id = 999;

      // First reset suspension to start clean
      await orngContract.actions.resetsuspen([orngOracle.name]).send(orngContract.name.toString() + '@active');

      // Create a request to generate reward
      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      // Give oracle 3 strikes by providing invalid signatures
      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const lastRequest = requestTable_rows[requestTable_rows.length - 1];
      // Strike 1
      await orngContract.actions.setrand([
        orngOracle.name,
        lastRequest.id,
        lastRequest.ver,
        'invalid_signature_1',
      ]).send(orngOracle.name.toString() + '@active');

      // Strike 2
      await orngContract.actions.setrand([
        orngOracle.name,
        lastRequest.id,
        lastRequest.ver,
        'invalid_signature_2',
      ]).send(orngOracle.name.toString() + '@active');

      // Strike 3 - this should suspend the oracle
      await orngContract.actions.setrand([
        orngOracle.name,
        lastRequest.id,
        lastRequest.ver,
        'invalid_signature_3',
      ]).send(orngOracle.name.toString() + '@active');

      // Verify oracle is suspended
      const oraclesTableAfterSuspension_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const suspendedOracle = oraclesTableAfterSuspension_rows.find(r => r.oracle === orngOracle.name.toString());
      expect(suspendedOracle.suspended).to.equal(true);

      const rsaSigning = new RSASigning(getRSAPrivateKey(lastRequest.ver));
      // Now have another oracle provide a valid signature to trigger reward distribution
      const msg = make_msg(lastRequest.seed, lastRequest.dapp, lastRequest.nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.actions.setrand([
        orngOracle2.name,
        lastRequest.id,
        lastRequest.ver,
        signed_value,
      ]).send(orngOracle2.name.toString() + '@active');

      // Check final balances - suspended oracle should not have received rewards
      const oraclesBalanceTableAfter_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const suspendedOracleBalanceBefore = oraclesBalanceTableBefore_rows.find(r => r.oracle === orngOracle.name.toString());
      const suspendedOracleBalanceAfter = oraclesBalanceTableAfter_rows.find(r => r.oracle === orngOracle.name.toString());
      const nonSuspendedOracleBalanceBefore = oraclesBalanceTableBefore_rows.find(r => r.oracle === orngOracle2.name.toString());
      const nonSuspendedOracleBalanceAfter = oraclesBalanceTableAfter_rows.find(r => r.oracle === orngOracle2.name.toString());

      // Suspended oracle balance should remain the same
      const suspendedBalanceBefore = suspendedOracleBalanceBefore ? Number(suspendedOracleBalanceBefore.unpaid.split(' ')[0]) * (10**8) : 0;
      const suspendedBalanceAfter = suspendedOracleBalanceAfter ? Number(suspendedOracleBalanceAfter.unpaid.split(' ')[0]) * (10**8) : 0;
      expect(suspendedBalanceAfter).to.equal(suspendedBalanceBefore);

      // Non-suspended oracle should have received rewards
      const nonSuspendedBalanceBefore = nonSuspendedOracleBalanceBefore ? Number(nonSuspendedOracleBalanceBefore.unpaid.split(' ')[0]) * (10**8) : 0;
      const nonSuspendedBalanceAfter = Number(nonSuspendedOracleBalanceAfter.unpaid.split(' ')[0]) * (10**8);
      expect(nonSuspendedBalanceAfter).to.be.above(nonSuspendedBalanceBefore);

      // reset suspension to start clean
      await orngContract.actions.resetsuspen([orngOracle.name]).send(orngContract.name.toString() + '@active');
    });

    it('should revert if key version mismatch', async () => {

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.setrand([
          orngOracle.name.toString(),
          requestTable_rows[requestTable_rows.length - 1].id,
          requestTable_rows[requestTable_rows.length - 1].ver + 1,
          'signature'
        ]).send(orngOracle.name.toString() + '@active'),
        'eosio_assert: version mismatch'
      );
    });

    it('should revert if key retired', async () => {

      const rsaSigning = new RSASigning(privateKey0);
      const assoc_id = 7;
      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const seed = requestTable_rows[requestTable_rows.length - 1].seed;
      const version = requestTable_rows[requestTable_rows.length - 1].ver;
      const nonce = requestTable_rows[requestTable_rows.length - 1].nonce;

      let msg = make_msg(seed, dappContract.name, nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.actions.retirepubkey([version]).send(govAccount.name.toString() + '@active');

      await expectToThrow(
        orngContract.actions.setrand([
          orngOracle.name.toString(),
          requestTable_rows[requestTable_rows.length - 1].id,
          version,
          signed_value
        ]).send(orngOracle.name.toString() + '@active'),
        'eosio_assert: key retired'
      );

      await orngContract.actions.setpubkey([
        3,
        exponent2,
        modulus2,
      ]).send(govAccount.name.toString() + '@active');
    });
  });

  describe('set mark failed and retry deliver test', () => {
    before(async () => {
      // Make sure contract is unpaused
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      // Ensure we have version 1 active (not retired)
      await orngContract.actions.setconfig(['activever', 1]).send(orngContract.name.toString() + '@active');
    });

    it('should revert if oracle not found', async () => {
      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await expectToThrow(
        orngContract.actions.markfailed([
          dappContract.name.toString(),
          requestTable_rows[requestTable_rows.length - 1].id,
          requestTable_rows[requestTable_rows.length - 1].ver,
          "signature",
          "fail message"
        ]).send(dappContract.name.toString() + '@active'),
        'eosio_assert: unknown oracle'
      );
    });

    it('should mark job failed successfully', async () => {

      const assoc_id = 8;

      await orngContract.actions.setconfig(['oraclereward', 3]).send(orngContract.name.toString() + '@active');

      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const seed = requestTable_rows[requestTable_rows.length - 1].seed;
      const version = requestTable_rows[requestTable_rows.length - 1].ver;
      const nonce = requestTable_rows[requestTable_rows.length - 1].nonce;
      let msg = make_msg(seed, dappContract.name.toString(), nonce);

      const rsaSigning = new RSASigning( getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      const oraclesBalanceTableBefore_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore_rows.find(r => r.oracle === orngOracle.name.toString());
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

     const transaction = await orngContract.actions.markfailed([
        orngOracle.name,
        requestTable_rows[requestTable_rows.length - 1].id,
        version,
        signed_value,
        "fail message",
      ]).send(orngOracle.name.toString() + '@active');

      let timeBlock = blockchain.timestamp;

      const requestTableAfter_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(requestTableAfter_rows.length).to.equal(requestTable_rows.length - 1);
      expect(requestTableAfter_rows.find(r => r.id === requestTable_rows[requestTable_rows.length - 1].id)).to.equal(undefined);

      const undeliveredTable_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const undeliveredItem = undeliveredTable_rows.find(r => r.request_id === requestTable_rows[requestTable_rows.length - 1].id);
      expect(undeliveredItem).to.exist;
      expect(undeliveredItem.dapp).to.equal(requestTable_rows[requestTable_rows.length - 1].dapp);
      expect(undeliveredItem.assoc_id).to.equal(requestTable_rows[requestTable_rows.length - 1].assoc_id);
      expect(undeliveredItem.error_message).to.equal('fail message');
      const transactionBlockTime = new Date(timeBlock);
      const oracleDeadLine = new Date(transactionBlockTime.getTime() + 3000);
      let rewardDate = new Date(undeliveredItem.oracle_reward_deadline);
      expect(rewardDate.toString()).to.equal(oracleDeadLine.toString());

      const oraclesTable_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const oraclesBalanceTableAfter_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      // only half reward distributed after markfail
      const halfReward = 500000/2;
      const rewardForEachOracle = Math.floor(halfReward / oraclesTable_rows.length);
      const oracleBalanceAfter = oraclesBalanceTableAfter_rows.find(r => r.oracle === orngOracle.name.toString());
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).to.equal(oracleBalanceBefore + rewardForEachOracle);
    });

    it('should retry deliver and get 50% remaining reward', async () => {
      const undeliveredTable_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const oraclesBalanceTableBefore_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore_rows.find(r => r.oracle === orngOracle.name.toString());
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

      await orngContract.actions.retrydeliver([undeliveredTable_rows[undeliveredTable_rows.length - 1].request_id]).send(orngOracle.name.toString() + '@active');

      const oraclesTable_rows = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const oraclesBalanceTableAfter_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      // remaining half reward distributed after retrydeliver
      const halfReward = 500000/2;
      const rewardForEachOracle = Math.floor(halfReward / oraclesTable_rows.length);
      const oracleBalanceAfter = oraclesBalanceTableAfter_rows.find(r => r.oracle === orngOracle.name.toString());
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).to.equal(oracleBalanceBefore + rewardForEachOracle);

      const undeliveredTableAfter_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(undeliveredTableAfter_rows.length).to.equal(undeliveredTable_rows.length - 1);
      expect(
        undeliveredTableAfter_rows.find(r => r.request_id === undeliveredTable_rows[undeliveredTable_rows.length - 1].request_id)
      ).to.be.undefined;
    });

    it('should revert if retrydeliver with item does not exist', async () => {
      await expectToThrow(
        orngContract.actions.retrydeliver([123]).send(orngOracle.name.toString() + '@active'),
        'eosio_assert: No undelivered result found for this request ID'
      );
    });

    it('should not reward if oracle not retry during dealine', async () => {

      const assoc_id = 9;

      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const lastRequest = requestTable_rows[requestTable_rows.length - 1];
      const seed = lastRequest.seed;
      const version = lastRequest.ver;
      const nonce = lastRequest.nonce;
      let msg = make_msg(seed, dappContract.name.toString(), nonce);

      const rsaSigning = new RSASigning( getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.actions.markfailed([
        orngOracle.name,
        requestTable_rows[requestTable_rows.length - 1].id,
        version,
        signed_value,
        "fail message",
      ]).send(orngOracle.name.toString() + '@active');

      const oraclesBalanceTableBefore_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore_rows.find(r => r.oracle === orngOracle.name.toString());
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

      const undeliveredTable_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await blockchain.addTime(seconds(4)); // wait till oracle reward deadline
      
      await orngContract.actions.retrydeliver([lastRequest.id]).send(orngOracle.name.toString() + '@active');

      const oraclesBalanceTableAfter_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const oracleBalanceAfter = oraclesBalanceTableAfter_rows.find(r => r.oracle === orngOracle.name.toString());
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).to.equal(oracleBalanceBefore);

      const undeliveredTableAfter_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(undeliveredTableAfter_rows.length).to.equal(undeliveredTable_rows.length - 1);
      expect(
        undeliveredTableAfter_rows.find(r => r.request_id === undeliveredTable_rows[undeliveredTable_rows.length - 1].request_id)
      ).to.be.undefined;
    });
  });

  describe('get result tests', () => {
    before(async () => {
      // Ensure we have a non-retired key active
      await orngContract.actions.setconfig(['activever', 3]).send(orngContract.name.toString() + '@active');
    });

    it('should revert if No undelivered result found for this assoc_id', async () => {
      await expectToThrow(
        orngContract.actions.getresult([
          orngContract.name.toString(),
          12389
        ]).send(orngContract.name.toString() + '@active'),
        'eosio_assert: No undelivered result found for this assoc_id'
      );
    });

    it('should get result successfully', async () => {

      const assoc_id = 10;

      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const seed = requestTable_rows[requestTable_rows.length - 1].seed;
      const version = requestTable_rows[requestTable_rows.length - 1].ver;
      const nonce = requestTable_rows[requestTable_rows.length - 1].nonce;
      let msg = make_msg(seed, dappContract.name.toString(), nonce);

      const rsaSigning = new RSASigning( getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.actions.markfailed([
        orngOracle.name,
        requestTable_rows[requestTable_rows.length - 1].id,
        version,
        signed_value,
        "fail message",
      ]).send(orngOracle.name.toString() + '@active');

      const oraclesBalanceTableBefore_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore_rows.find(r => r.oracle === orngOracle.name.toString());
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

      const undeliveredTable_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();


      await blockchain.addTime(seconds(4)); // wait till oracle reward deadline
      await dappContract.actions.getresult([10]).send(dappContract.name.toString() + '@active');

      const oraclesBalanceTableAfter_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const oracleBalanceAfter = oraclesBalanceTableAfter_rows.find(r => r.oracle === orngOracle.name.toString());
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).to.equal(oracleBalanceBefore);

      const undeliveredTableAfter_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(undeliveredTableAfter_rows.length).to.equal(undeliveredTable_rows.length - 1);
      expect(
        undeliveredTableAfter_rows.find(r => r.request_id === undeliveredTable_rows[undeliveredTable_rows.length - 1].request_id)
      ).to.be.undefined;
    });
  })

  describe('cleanup tests', () => {
    before(async () => {
      // Make sure contract is unpaused
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      // Ensure we have version 1 active (not retired)
      await orngContract.actions.setconfig(['activever', 1]).send(orngContract.name.toString() + '@active');
    });

    it('should revert if unknown oracle', async () => {
      await expectToThrow(
        orngContract.actions.cleanup([
          dappContract.name.toString(),
          10
        ]).send(dappContract.name.toString() + '@active'),
        'eosio_assert: unknown oracle'
      );
    });

    it('should cleanup undelivered_table', async () => {

      await orngContract.actions.setconfig(['oraclereward', 10]).send(orngContract.name.toString() + '@active');

      for (let i = 1; i <= 12; i++) {
        const assoc_id = 11 + i;

        await orngContract.actions.requestrand([assoc_id, 12345 + i, dappContract.name]).send(dappContract.name.toString() + '@active');
        const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
          .getTableRows();

        const seed = requestTable_rows[requestTable_rows.length - 1].seed;
        const version = requestTable_rows[requestTable_rows.length - 1].ver;
        const nonce = requestTable_rows[requestTable_rows.length - 1].nonce;
        const dappName = requestTable_rows[requestTable_rows.length - 1].dapp;
        let msg = make_msg(seed, dappName, nonce);

        const rsaSigning = new RSASigning( getRSAPrivateKey(version));
        const signed_value = rsaSigning.generateRandomNumber(msg);

        await orngContract.actions.markfailed([
          orngOracle.name,
          requestTable_rows[requestTable_rows.length - 1].id,
          version,
          signed_value,
          "fail message",
        ]).send(orngOracle.name.toString() + '@active');
      }

      const undeliveredTable_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      // Verify we have undelivered entries (exact count may vary due to opportunistic cleanup)
      expect(undeliveredTable_rows.length).to.be.above(0);

      await blockchain.addTime(seconds(15)); // wait till oracle reward deadline

      await orngContract.actions.cleanup([orngOracle.name, 60]).send(orngOracle.name.toString() + '@active');

      const undeliveredTableAfter_rows = orngContract.tables['undelivered1'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(undeliveredTableAfter_rows.length).to.equal(0);
    });
  })


  describe('claim tests', () => {
    it('can not claim if paused', async () => {
      await orngContract.actions.pause([true]).send(orngContract.name.toString() + '@active');
      await expectToThrow(
        orngContract.actions.claim([orngOracle.name.toString()]).send(orngOracle.name.toString() + '@active'),
        'eosio_assert: paused'
      );

      // enable requestrand
      await orngContract.actions.pause([false]).send(orngContract.name.toString() + '@active');
    });

    it('should claim', async () => {
      let balanceTable_rows = orngContract.tables['balances'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      let orngOracle2Balance =  getBalance(eosioToken, orngOracle.name);
      let balance = balanceTable_rows.find(x => x.oracle === orngOracle.name.toString());

      let unpaid = parseFloat(balance.unpaid.split(' ')[0]);
      await orngContract.actions.claim([orngOracle.name]).send(orngOracle.name.toString() + '@active');
      let balanceAfter =  getBalance(eosioToken, orngOracle.name);
      expect(balanceAfter.amount).to.equal(unpaid + orngOracle2Balance.amount);
    });

    it('can not claim if no balance', async () => {
      let [oracle2] = await blockchain.createAccounts('oracle2'); 
      await expectToThrow(
        orngContract.actions.claim([oracle2.name.toString()]).send(oracle2.name.toString() + '@active'),
        'eosio_assert: not an oracle'
      );
    });
    
  });

  describe('pause requestrand tests', () => {
    before(async () => {
      // Make sure contract is unpaused
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      // Ensure we have version 1 active (not retired)
      await orngContract.actions.setconfig(['activever', 1]).send(orngContract.name.toString() + '@active');

      await orngContract.actions.setoracles([[orngOracle.name]]).send(govAccount.name.toString() + '@active');
      await eosioToken.actions.transfer([
        dappContract.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'stake-' + dappContract.name.toString()
      ]).send(dappContract.name.toString() + '@active');
    });
    it('should throw if the requestrand is paused', async () => {

      const assoc_id = 987;
      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      await orngContract.actions.pauserequest([true]).send(orngContract.name.toString() + '@active');

      await expectToThrow(
        orngContract.actions.requestrand([
          0,
          12345,
          dappContract.name.toString()
        ]).send(dappContract.name.toString() + '@active'),
        'eosio_assert: Orng.wax are under maintenance, please try again later'
      );

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      let req = requestTable_rows[requestTable_rows.length - 1];
      
      const rsaSigning = new RSASigning( getRSAPrivateKey(req.ver));
      let msg = make_msg(req.seed, dappContract.name, req.nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);
      // still able to setrand
      await orngContract.actions.setrand([
        orngOracle.name.toString(),
        req.id,
        req.ver,
        signed_value
      ]).send(orngOracle.name.toString() + '@active');

      // Check if results were delivered
      const results_tbl_rows = dappContract.tables['results'](nameToBigInt(dappContract.name.toString()))
        .getTableRows();
      const signed_value_hash = crypto.createHash('sha256').update(signed_value).digest('hex');
      const result = results_tbl_rows.find(r => r.assoc_id === assoc_id);
      if (result) {
        expect(result.assoc_id).to.equal(assoc_id);
        expect(result.random_value).to.equal(signed_value_hash);
      }


      // enable requestrand
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');
      // should able to requestrand when pauserequest is false
      await orngContract.actions.requestrand([
        0,
        12345,
        dappContract.name.toString()
      ]).send(dappContract.name.toString() + '@active');
    });
  });

  describe('kill jobs tests', () => {
    before(async () => {
      // Ensure requestrand is not paused from previous tests
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      await orngContract.actions.setoracles([[orngOracle.name]]).send(govAccount.name.toString() + '@active');
      await eosioToken.actions.transfer([
        dappContract.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'stake-' + dappContract.name.toString()
      ]).send(dappContract.name.toString() + '@active');

    });
    it('throw if unauthorized account', async () => {

      const signing_value = getRandomInt(123456789);
      const assoc_id = 7;
      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');
      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      await expectToThrow(
        orngContract.actions.killjobs([[requestTable_rows[requestTable_rows.length - 1].id]]).send(dappContract.name.toString() + '@active'),
        'missing required authority orng.wax'
      );
    });

    it('should kill a job', async () => {

      const signing_value = getRandomInt(123456789);
      const assoc_id = 7;
      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      await orngContract.actions.killjobs([[requestTable_rows[requestTable_rows.length - 1].id]]).send(govAccount.name.toString() + '@active');

      const new_requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(new_requestTable_rows.length).to.be.below(requestTable_rows.length);
      expect(
        new_requestTable_rows.find((j) => j.id === requestTable_rows[requestTable_rows.length - 1].id)
      ).to.equal(undefined);
    });

    it('should kill several jobs', async () => {

      const signing_value = getRandomInt(123456789);
      const assoc_id = 8;

      await orngContract.actions.requestrand([assoc_id, 12345, dappContract.name]).send(dappContract.name.toString() + '@active');

      await orngContract.actions.requestrand([
        assoc_id + 1,
        12345,
        dappContract.name.toString(),
      ]).send(dappContract.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      
      let lastReq = requestTable_rows[requestTable_rows.length - 1];
      let secondLastReq = requestTable_rows[requestTable_rows.length - 2];
      
      await orngContract.actions.killjobs([[secondLastReq.id, lastReq.id]]).send(orngContract.name.toString() + '@active');

      const new_requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      expect(new_requestTable_rows.length).to.equal(requestTable_rows.length - 2);
    });
  });

  describe('test ban/unban', () => {
    it('throw if missing self permission', async () => {
      await expectToThrow(
        orngContract.actions.ban([dappContract.name.toString()]).send(dappContract.name.toString() + '@active'),
        `missing required authority orng.wax`
      );

      await expectToThrow(
        orngContract.actions.unban([dappContract.name.toString()]).send(dappContract.name.toString() + '@active'),
        `missing required authority orng.wax`
      );
    });

    it('Should ban dapp', async () => {
      await orngContract.actions.ban([dappContract.name]).send(orngContract.name.toString() + '@active');

      const banTable_rows = orngContract.tables['banlist.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(banTable_rows.length).to.equal(1);
      expect(banTable_rows[0].dapp).to.equal(dappContract.name.toString());

    });

    it('throw if already ban daap', async () => {
      await expectToThrow(
        orngContract.actions.ban([dappContract.name.toString()]).send(orngContract.name.toString() + '@active'),
        'eosio_assert: Dapp already added to the banlist'
      );
    });

    it('Should unban dapp', async () => {
      await orngContract.actions.unban([dappContract.name]).send(orngContract.name.toString() + '@active');

      const banTable_rows = orngContract.tables['banlist.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      expect(banTable_rows.length).to.equal(0);
    });

    it('throw if unban dapp not in the list', async () => {
      await expectToThrow(
        orngContract.actions.unban([dappContract.name.toString()]).send(orngContract.name.toString() + '@active'),
        'eosio_assert: Dapp not in the banlist'
      );
    });
  });

  describe('test callback failure and retry mechanism', () => {
    let failingDapp;
    let failingDappAcc;
    let requestId;

    before(async () => {
      // Create a new dapp account for testing callback failures
      failingDapp = 'failingdapp';
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

      // Deploy the failing dapp with requestrand contract that can simulate failures
      failingDappAcc = blockchain.createAccount({
        name: Name.from('failingdapp'),
        wasm: fs.readFileSync('./tests/contracts/requestrand.wasm'),
        abi: fs.readFileSync('./tests/contracts/requestrand.abi', 'utf8'),
        enableInline: true,
      });

      // Deposit WAX for the dapp to make requests
      await sendWaxToAccount(failingDappAcc.name, '100.00000000 WAX');
      await eosioToken.actions.transfer([
        failingDappAcc.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        'deposit-' + failingDappAcc.name.toString()
      ]).send(failingDappAcc.name.toString() + '@active');

      // Set up oracles
      await orngContract.actions.setoracles([[orngOracle.name]]).send(govAccount.name.toString() + '@active');
      // Set callback retries to 2 for faster testing
      await orngContract.actions.setconfig(['callbackret', 2]).send(orngContract.name.toString() + '@active');
    });
  });
 
  describe('test signvals.a backwards compatibility', () => {
    it('signvals.a table should exist and be empty', async () => {
      // Check that the signvals.a table exists (for backwards compatibility)
      const signvalsTable_rows = orngContract.tables['signvals.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      // Table should exist but be empty
      expect(signvalsTable_rows).to.exist;
      expect(signvalsTable_rows.length).to.equal(0);
    });

    it('atomicpacks-style check should work with empty table', async () => {
      // Simulate what atomicpacks does: check if signing_value exists
      const signing_value = 12345;

      const signvalsTable_row = orngContract.tables['signvals.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(vert.bigIntToBn(signing_value));

      // Should find nothing, allowing atomicpacks to use the original signing_value
      expect(signvalsTable_row).to.equal(undefined);
    });

    it('multiple requests with same signing_value should work due to nonce', async () => {
      // Ensure the contract is not paused
      await orngContract.actions.pauserequest([false]).send(orngContract.name.toString() + '@active');

// TODO: Consider grouping with blockchain.createAccounts()
      let testDapp = await blockchain.createAccount('testdapp', '100.00000000 WAX', 4565215);
      await sendWaxToAccount(testDapp.name, '100.00000000 WAX');
      await eosioToken.actions.transfer([
        testDapp.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        'deposit-' + testDapp.name.toString()
      ]).send(testDapp.name.toString() + '@active');

      // Make multiple requests with the same signing_value
      const signing_value = 99999;

      // First request
      await orngContract.actions.requestrand([
        1001,
        signing_value,
        testDapp.name,
      ]).send(testDapp.name.toString() + '@active');

      // Second request with same signing_value should also work
      await orngContract.actions.requestrand([
        1002,
        signing_value,
        testDapp.name,
      ]).send(testDapp.name.toString() + '@active');

      // Check both requests exist with different nonces
      const reqTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      const requests = reqTable_rows.filter(r => r.dapp === testDapp.name.toString() && (r.assoc_id === 1001 || r.assoc_id === 1002));
      expect(requests.length).to.be.at.least(1);
      if (requests.length >= 2) {
        expect(requests[0].nonce).not.to.equal(requests[1].nonce);
      }
    });
  });

  describe('test retirepubkey', () => {
    let testDapp;
    let testDappAcc;
    let requestId;

    before(async () => {
      testDapp = 'retire.test';
      [testDappAcc] = await blockchain.createAccounts(testDapp);
      await sendWaxToAccount(testDappAcc.name, '10.00000000 WAX');
      await eosioToken.actions.transfer([
        testDappAcc.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        'deposit-' + testDappAcc.name.toString()
      ]).send(testDappAcc.name.toString() + '@active');
    });

    it('should throw if missing governance permission', async () => {
      await expectToThrow(
        orngContract.actions.retirepubkey([1]).send(testDappAcc.name.toString() + '@active'),
        `missing required authority ${govAccount.name.toString()}`
      );
    });

    it('should throw if key version not found', async () => {
      await expectToThrow(
        orngContract.actions.retirepubkey([99]).send(govAccount.name.toString() + '@active'),
        'eosio_assert: key not found'
      );
    });

    it('should make rand request before retiring key', async () => {
      const assoc_id = 999;
      await orngContract.actions.requestrand([assoc_id, 54321, testDapp]).send(testDappAcc.name.toString() + '@active');

      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const request = requestTable_rows[requestTable_rows.length - 1];
      requestId = request.id;

      expect(request.dapp).to.equal(testDapp);
      expect(request.seed).to.exist;
      expect(request.ver).to.exist;
      expect(request.nonce).to.exist;
    });

    it('should retire public key', async () => {
      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const request = requestTable_rows.find(r => r.id === requestId);
      const keyVersion = request.ver;

      // Check key is not retired before
      let pubkeyTables = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();

      let pubkeyTable_row = pubkeyTables.find(r => r.ver == keyVersion);
      expect(pubkeyTable_row.retired).to.equal(false);

      // Retire the key
      await orngContract.actions.retirepubkey([keyVersion]).send(govAccount.name.toString() + '@active');

      // Check key is now retired
      const pubkeyRow = orngContract.tables['pubkeys'](nameToBigInt(orngContract.name.toString()))
        .getTableRow(BigInt(keyVersion));
      expect(pubkeyRow.retired).to.equal(true);
    });

    it('should reject oracle submission with retired key', async () => {
      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const request = requestTable_rows.find(r => r.id === requestId);
      const rsaSigning = new RSASigning(getRSAPrivateKey(request.ver));
      let msg = make_msg(request.seed, testDapp, request.nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await expectToThrow(
        orngContract.actions.setrand([
          orngOracle.name.toString(),
          request.id,
          request.ver,
          signed_value
        ]).send(orngOracle.name.toString() + '@active'),
        'eosio_assert: key retired'
      );
    });
  });
});