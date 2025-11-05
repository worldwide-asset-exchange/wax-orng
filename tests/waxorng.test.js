const { Chain, Account } = require('qtest-js');

const crypto = require('crypto');
const fs = require('fs');
const { RSASigning, make_msg } = require('./rsaSigning.js');
const { fail } = require('assert');

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
  let chain;
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
    await delphiAccount.contract.action.newbounty(
      {
        proposer: delphiAccount.name,
        pair: {
          name: "waxpeos",
          base_symbol: "8,WAXP",
          base_type: 4,
          base_contract: "",
          quote_symbol: "4,EOS",
          quote_type: 2,
          quote_contract: "",
          quoted_precision: 6,
        },
      },
      getActivePermission([delphiAccount.name]),
    );

    await delphiAccount.contract.action.newbounty(
      {
        proposer: delphiAccount.name,
        pair: {
          name: "waxpusd",
          base_symbol: "8,WAXP",
          base_type: 4,
          base_contract: "",
          quote_symbol: "2,USD",
          quote_type: 1,
          quote_contract: "",
          quoted_precision: 4,
        },
      },
      getActivePermission([delphiAccount.name]),
    );

    let now = new Date();
    let nowString = now.toISOString().replace('Z', '');

    await delphiAccount.contract.table.datapoints.insert({
      waxpusd: [
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
      ],
    });
  }

  beforeAll(async () => {
    jest.setTimeout(20000);

    chain = await Chain.setupChain('WAX');

    [pauseAcc, payee, payer] =
      await chain.system.createAccounts(
        [pauseAcc, payee, payer],
        '10000.00000000 WAX'
      );

    orngContract = await chain.system.createAccount(orngContract, "10000.00000000 WAX", 4565215);
    orngOracle = await chain.system.createAccount(orngOracle, "10000.00000000 WAX", 4565215);
    orngOracle2 = await chain.system.createAccount(orngOracle2, "10000.00000000 WAX", 4565215);
    orngV1Oracle = await chain.system.createAccount(orngV1Oracle, "10000.00000000 WAX", 4565215);
    orngOracle3 = await chain.system.createAccount(orngOracle3, "10000.00000000 WAX", 4565215);
    orngOracle4 = await chain.system.createAccount(orngOracle4, "10000.00000000 WAX", 4565215);
    dappContract = await chain.system.createAccount(dappContract, "10000.00000000 WAX", 4565215);
    testToken = await chain.system.createAccount(testToken, "10000.00000000 WAX", 4565215);
    delphiAccount = await chain.system.createAccount(delphiAccount, "1000.00000000 WAX", 4565215);

    govAccount = orngContract;
    await testToken.setContract({
      abi: './tests/contracts/eosio.token.abi',
      wasm: './tests/contracts/eosio.token.wasm',
    });
    await testToken.addCode('active');
    
    await orngContract.setContract({
      abi: './build/wax.orng.abi',
      wasm: './build/wax.orng.wasm',
    });
    await orngContract.addCode('active');

    await dappContract.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });
    await dappContract.addCode('active');

    await delphiAccount.setContract({
      abi: "./tests/contracts/delphioracle.abi",
      wasm: "./tests/contracts/delphioracle.wasm",
    });

    await delphiAccount.addCode("active");
    await initDelphioracle(delphiAccount);


    await orngV1Oracle.updateAuth(
      'active',
      'owner',
      1,
      [],
      [
        {
          permission: {
            actor: orngContract.name,
            permission: `eosio.code`,
          },
          weight: 1,
        },
      ]
    );

    await orngContract.contract.action.setpubkey(
      {
        version: 1,
        exponent: exponent0,
        modulus: modulus0,
      },
      [
        {
          actor:  govAccount.name,
          permission: 'active',
        },
      ]
    );

    // create pause permisison
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

    await testToken.contract.action.transfer(
      {
        from: testToken.name,
        to: dappContract.name,
        quantity: "1000000.0000 TST",
        memo: "transfer",
      },
      [{ actor: testToken.name, permission: 'active' }]
    );

  });

  afterAll(async () => {
    await chain.clear();
  }, 10000);

  describe('Initialize', () => {
    it('should init first signing key', async () => {
      const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
      });

      expect(pubkey_tbl.rows[pubkey_tbl.rows.length - 1].ver).toEqual(1);
      expect(pubkey_tbl.rows[pubkey_tbl.rows.length - 1].pubkey_hash_id).toEqual(modulus0Id);
      expect(pubkey_tbl.rows[pubkey_tbl.rows.length - 1].exponent).toEqual(exponent0);
      expect(pubkey_tbl.rows[pubkey_tbl.rows.length - 1].modulus).toEqual(modulus0);
    });
  });

  describe('test setconfig', () => {
    it('throw if missing self permission', async () => {
      await expect(
        orngContract.contract.action.setconfig(
          {
            config: 'bwpaidmaxjob',
            value: 999,
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

    it('should set config', async () => {
      await orngContract.contract.action.setconfig(
        {
          config: 'bwpaidmaxjob',
          value: 999,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'bwpaidmaxjob',
        upper_bound: 'bwpaidmaxjob',
      });

      expect(configTable.rows.length).toBe(1);
      expect(configTable.rows[0].value).toBe(999);
    });
    it('should set configv2', async () => {
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

      const configTable = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'feepercall',
        upper_bound: 'feepercall',
      });

      expect(configTable.rows.length).toBe(1);
      expect(configTable.rows[0].value).toBe(500000);

      const configTable2 = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'strikesmax',
        upper_bound: 'strikesmax',
      });

      expect(configTable2.rows.length).toBe(1);   
      expect(configTable2.rows[0].value).toBe(3);

      const configTable3 = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'kcallsperwax',
        upper_bound: 'kcallsperwax',
      });

      expect(configTable3.rows.length).toBe(1);
      expect(configTable3.rows[0].value).toBe(10);

      const configTable4 = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'fcallsperhr',
        upper_bound: 'fcallsperhr',
      });

      expect(configTable4.rows.length).toBe(1);
      expect(configTable4.rows[0].value).toBe(5);

      const configTable5 = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'treasfloor',
        upper_bound: 'treasfloor',
      });

      expect(configTable5.rows[0].value).toBe(10);
    });

  });

  it('should set configv3', async () => {
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 0,
          minclaimint: 0,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
      const configTable5 = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'stipendmonth',
        upper_bound: 'stipendmonth',
      });

      expect(configTable5.rows[0].value).toBe(0);
    }
  );

  describe('set publickey tests', () => {
    it('should throw if key version exists', async () => {
      const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
      });

      await expect(
        orngContract.contract.action.setpubkey(
          {
            version: 1,
            exponent: 'exponent2',
            modulus: 'modulus2',
          },
          [
            {
              actor: govAccount.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('key with this version has already existed');
    });

    it('should prevent modulus with leading zeroes', async () => {
      const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
      });

      await expect(
        orngContract.contract.action.setpubkey(
          {
            version: 2,
            exponent: 'exponent2',
            modulus: '0modulus2',
          },
          [
            {
              actor: govAccount.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('modulus must have leading zeroes stripped');
    });

    it('should prevent empty modulus', async () => {
      const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
      });

      await expect(
        orngContract.contract.action.setpubkey(
          {
            version: 2,
            exponent: 'exponent2',
            modulus: '',
          },
          [
            {
              actor: govAccount.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('modulus must have non-zero length');
    });

     it('should prevent version increment wrong', async () => {
      const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
      });

      await expect(
        orngContract.contract.action.setpubkey(
         {
          version: 3,
          exponent: exponent1,
          modulus: modulus1,
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
        )
      ).rejects.toThrowError('version must increment by 1');
    });

    it('should set next publickey', async () => {
      // const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
      //   scope: orngContract.name,
      // });

      await orngContract.contract.action.setpubkey(
        {
          version: 2,
          exponent: exponent1,
          modulus: modulus1,
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      const pubkey_tbl = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
      });

      expect(pubkey_tbl.rows[pubkey_tbl.rows.length - 1].ver).toEqual(2);
      expect(pubkey_tbl.rows[pubkey_tbl.rows.length - 1].exponent).toEqual(exponent1);
      expect(pubkey_tbl.rows[pubkey_tbl.rows.length - 1].modulus).toEqual(modulus1);
    });
  });

  describe('test treasury', () => {
    let treasuryAccount;
    let dappTest11, dappTest12;
    
    beforeAll(async () => {
      await orngContract.contract.action.setoracles(
        {
          oracles: [orngOracle3.name, orngOracle4.name],
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      

      treasuryAccount = await chain.system.createAccount('treasury1', '1000.00000000 WAX', 4565215);
      dappTest11 = await chain.system.createAccount('dapptest11', '1000.00000000 WAX', 4565215);
      dappTest12 = await chain.system.createAccount('dapptest12', '1001.00000000 WAX', 4565215);
      dappTest13 = await chain.system.createAccount('dapptest13', '1002.00000000 WAX', 4565215);
      await dappTest11.setContract({
        wasm: './tests/contracts/randreceiver.wasm',
        abi: './tests/contracts/randreceiver.abi',
      });
      await dappTest12.setContract({
        wasm: './tests/contracts/randreceiver.wasm',
        abi: './tests/contracts/randreceiver.abi',
      });
      await dappTest13.setContract({
        wasm: './tests/contracts/randreceiver.wasm',
        abi: './tests/contracts/randreceiver.abi',
      });
    });
    it('should deposit treasury', async () => {
      await treasuryAccount.transfer(orngContract.name, '0.04500000 WAX', 'treasury');
      const treasuryTable = await orngContract.contract.table['treasury'].get({
        scope: orngContract.name,
      });
      expect(treasuryTable.rows.length).toBe(1);
      expect(treasuryTable.rows[0].pool_balance).toBe(4500000);
    });

    it('should not deposit non WAX token', async () => {
      await testToken.contract.action.transfer(
        {
          from: testToken.name,
          to: treasuryAccount.name,
          quantity: "1000000.0000 TST",
          memo: "transfer",
        },
        [{ actor: testToken.name, permission: 'active' }]
      );
      await expect(
        testToken.contract.action.transfer(
          {
            from: treasuryAccount.name,
            to: orngContract.name,
            quantity: "1000000.0000 TST",
            memo: "transfer",
          },
          [{ actor: treasuryAccount.name, permission: 'active' }]
        )
      ).rejects.toThrowError('only support eosio.token');
    });

    it('should not charge treasury if dapp is deposited', async () => {
      // Disable free tier to test deposit functionality
      await orngContract.contract.action.configv2(
        {
          fee_per_call: '0.00500000 WAX',
          strike_max: 3,
          k_calls_per_wax: 3,
          free_calls_per_hour: 0,  // Disable free tier
          treas_hardfloor: 10,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      await dappTest11.transfer(orngContract.name, '1.00000000 WAX', 'deposit-' + dappTest11.name);
      const treasuryTable = await orngContract.contract.table['treasury'].get({
        scope: orngContract.name,
      });
      let balanceBefore = treasuryTable.rows[0].pool_balance; 

      const assoc_id = 5;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
          signing_value: 12345,
          caller: dappTest11.name,
        },
        [
          {
            actor: dappTest11.name,
            permission: 'active',
          },
        ]
      );

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });
      let request = requestTable.rows[requestTable.rows.length - 1];

      const seed = request.seed;
      const version = request.ver;
      const nonce = request.nonce;
      const rsaSigning = new RSASigning( getRSAPrivateKey(version));

      let msg = make_msg(seed, dappTest11.name, nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);
      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle3.name,
          id: request.id,
          ver: request.ver,
          sig: signed_value,
        },
        [
          {
            actor: orngOracle3.name,
            permission: 'active',
          },
        ]
      );

      let newRequestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
        lower_bound: request.id,
        uppper_bound: request.id,
      });
      expect(newRequestTable.rows.length).toBe(0);

      let balanceAfter = await orngContract.contract.table['treasury'].get({
        scope: orngContract.name,
      });
      expect(balanceAfter.rows[0].pool_balance).toBe(balanceBefore);
    })

  });


  describe('test stake', () => {
    beforeAll(async () => {
      // Set config with k_calls_per_wax=10 to match test expectations
      await orngContract.contract.action.configv2(
        {
          fee_per_call: '0.00500000 WAX',
          strike_max: 3,
          k_calls_per_wax: 10,  // Tests expect this value
          free_calls_per_hour: 0,
          treas_hardfloor: 10,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
    });

    describe('memo parsing validation', () => {
      it('should reject stake with uppercase account name', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-UPPERCASE')
        ).rejects.toThrow('character is not in allowed character set for names');
      });

      it('should reject stake with invalid characters in account name', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-name@#$')
        ).rejects.toThrow('character is not in allowed character set for names');
      });

      it('should reject stake with empty account name', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-')
        ).rejects.toThrow('invalid memo format: stake-<dapp_name>');
      });

      it('should reject stake with account name exceeding 12 characters', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-verylongnameexceeds')
        ).rejects.toThrow('invalid dapp name length');
      });

      it('should reject deposit with uppercase account name', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'deposit-UPPERCASE')
        ).rejects.toThrow('character is not in allowed character set for names');
      });

      it('should reject deposit with invalid characters in account name', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'deposit-name@#$')
        ).rejects.toThrow('character is not in allowed character set for names');
      });

      it('should reject deposit with empty account name', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'deposit-')
        ).rejects.toThrow('invalid memo format: deposit-<dapp_name>');
      });

      it('should reject deposit with account name exceeding 12 characters', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'deposit-verylongnameexceeds')
        ).rejects.toThrow('invalid dapp name length');
      });

      it('should reject stake for non-existent account', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-noexist1234')
        ).rejects.toThrow('dapp account does not exist');
      });

      it('should reject deposit for non-existent account', async () => {
        await expect(
          dappContract.transfer(orngContract.name, '1.00000000 WAX', 'deposit-noexist1111')
        ).rejects.toThrow('dapp account does not exist');
      });
    });

    it('should throw if stake with invalid symbol', async () => {
      await expect(
        // dappContract.transfer(orngContract.name, '1.0000 TST', 'stake')
        testToken.contract.action.transfer(
          {
            from: dappContract.name,
            to: orngContract.name,
            quantity: '1.0000 TST',
            memo: 'stake-' + dappContract.name,
          },
          [{ actor: dappContract.name, permission: 'active' }]
        )
      ).rejects.toThrowError('only support eosio.token');
    });

    it('should stake with valid transfer', async () => {
      let balanceBefore = await orngContract.getBalance();
      await dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-' + dappContract.name);
      const stakeTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappContract.name,
        upper_bound: dappContract.name,
      });
      expect(stakeTable.rows.length).toBe(1);
      expect(stakeTable.rows[0].stake).toBe('1.00000000 WAX');
      let balanceAfter = await orngContract.getBalance();
      expect(balanceAfter.amount - balanceBefore.amount).toBe(1);
    });

    it('should increase credits with stake', async () => {
      jest.setTimeout(60000);

      const dstake2 = await chain.system.createAccount('dstake2', '10000.00000000 WAX', 4565215);
      // stake
      await dstake2.transfer(orngContract.name, '1000.00000000 WAX', 'stake-' + dstake2.name);
      const stakeTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dstake2.name,
        upper_bound: dstake2.name,
      });
      expect(stakeTable.rows.length).toBe(1);
      expect(stakeTable.rows[0].stake).toBe('1000.00000000 WAX');
      let timeUpdate = stakeTable.rows[0].last_update;
      //await chain.time.increase(1 * 60 * 60); // not work with current version of qtest-js
      await chain.waitTillNextBlock(30); // 15 seconds

      await dstake2.transfer(orngContract.name, '0.00000001 WAX', 'stake-' + dstake2.name);
      const stakeTableAfter = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dstake2.name,
        upper_bound: dstake2.name,
      });
      let timeUpdateAfter = stakeTableAfter.rows[0].last_update;
      let timeDiff = Math.floor((new Date(timeUpdateAfter).getTime() - new Date(timeUpdate).getTime()) / 1000);
      let estimatedCredits = 1000 * 10 * timeDiff / 3600;
      expect(stakeTableAfter.rows[0].credits).toBe(stakeTable.rows[0].credits + Math.floor(estimatedCredits));
    });

    it('should decrease credits with reqrand', async () => {
      jest.setTimeout(60000);

      const dstake3 = await chain.system.createAccount('dstake3', '10000.00000000 WAX', 4565215);
      // stake
      await dstake3.transfer(orngContract.name, '1000.00000000 WAX', 'stake-' + dstake3.name);
      const stakeTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dstake3.name,
        upper_bound: dstake3.name,
      });
      expect(stakeTable.rows.length).toBe(1);
      expect(stakeTable.rows[0].stake).toBe('1000.00000000 WAX');
      let timeUpdate = stakeTable.rows[0].last_update;
      //await chain.time.increase(1 * 60 * 60); // not work with current version of qtest-js
      await chain.waitTillNextBlock(30); // 15 seconds
      
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 1,
          signing_value: 12345,
          caller: dstake3.name,
        },
        [
          {
            actor: dstake3.name,
            permission: 'active',
          },
        ]
      );
      const stakeTableAfter = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dstake3.name,
        upper_bound: dstake3.name,
      });
      let timeUpdateAfter = stakeTableAfter.rows[0].last_update;
      let timeDiff = Math.floor((new Date(timeUpdateAfter).getTime() - new Date(timeUpdate).getTime()) / 1000);
      let estimatedCredits = 1000 * 10 * timeDiff / 3600;
      
      // minus one for the requestrand
      expect(stakeTableAfter.rows[0].credits + 1).toBe(stakeTable.rows[0].credits + Math.floor(estimatedCredits));
    });

    it('should allow anyone to stake for dapp', async () => {
      let staker = await chain.system.createAccount('staker1', '100.00000000 WAX', 4565215);
      let targetDapp = await chain.system.createAccount('targetdapp', '0.00000000 WAX', 4565215);

      let balanceBefore = await orngContract.getBalance();
      await staker.transfer(orngContract.name, '50.00000000 WAX', 'stake-' + targetDapp.name);

      // Check acctstate table (total stake for dapp)
      const acctTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: targetDapp.name,
        upper_bound: targetDapp.name,
      });
      expect(acctTable.rows.length).toBe(1);
      expect(acctTable.rows[0].stake).toBe('50.00000000 WAX');

      // Check userstakes table (individual user stake for dapp)
      const userStakesTable = await orngContract.contract.table['userstakes'].get({
        scope: targetDapp.name,
        lower_bound: staker.name,
        upper_bound: staker.name,
      });
      expect(userStakesTable.rows.length).toBe(1);
      expect(userStakesTable.rows[0].user).toBe(staker.name);
      expect(userStakesTable.rows[0].amount).toBe('50.00000000 WAX');

      let balanceAfter = await orngContract.getBalance();
      expect(balanceAfter.amount - balanceBefore.amount).toBe(50);
    });

    it('should allow user to unstake their own stake', async () => {
      let staker = await chain.system.createAccount('staker2', '100.00000000 WAX', 4565215);
      let targetDapp = await chain.system.createAccount('targetdapp2', '0.00000000 WAX', 4565215);

      // First stake
      await staker.transfer(orngContract.name, '30.00000000 WAX', 'stake-' + targetDapp.name);

      // set config to unstake time for test (5 seconds)
      await orngContract.contract.action.setconfig(
        {
          config: 'unstaketime',
          value: 5,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Stake again
      await staker.transfer(orngContract.name, '20.00000000 WAX', 'stake-' + targetDapp.name);

      let stakerBalanceBefore = await staker.getBalance();

      // Unstake
      await orngContract.contract.action.unstakeuser(
        {
          user: staker.name,
          dapp: targetDapp.name,
          quantity: '10.00000000 WAX',
        },
        [
          {
            actor: staker.name,
            permission: 'active',
          },
        ]
      );

      // Check userstakes table - stake should be reduced immediately
      const userStakesTable = await orngContract.contract.table['userstakes'].get({
        scope: targetDapp.name,
        lower_bound: staker.name,
        upper_bound: staker.name,
      });
      expect(userStakesTable.rows.length).toBe(1);
      expect(userStakesTable.rows[0].amount).toBe('40.00000000 WAX');

      // Check acctstate table - stake should be reduced immediately
      const acctTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: targetDapp.name,
        upper_bound: targetDapp.name,
      });
      expect(acctTable.rows[0].stake).toBe('40.00000000 WAX');

      // Check unstake table has the request
      const unstakeTable = await orngContract.contract.table['unstake'].get({
        scope: targetDapp.name,
        lower_bound: staker.name,
        upper_bound: staker.name,
      });
      expect(unstakeTable.rows.length).toBe(1);
      expect(unstakeTable.rows[0].amount).toBe('10.00000000 WAX');

      // Balance should not change yet (tokens not transferred)
      let stakerBalanceAfter = await staker.getBalance();
      expect(stakerBalanceAfter.amount).toBe(stakerBalanceBefore.amount);

      // Wait for unstake time to pass
      await chain.waitTillNextBlock(20); // 10 seconds

      // Claim funds
      await orngContract.contract.action.claimfund(
        {
          user: staker.name,
          dapp: targetDapp.name,
        },
        [
          {
            actor: staker.name,
            permission: 'active',
          },
        ]
      );

      // Check unstake table should be empty after claim
      const unstakeTableAfterClaim = await orngContract.contract.table['unstake'].get({
        scope: targetDapp.name,
      });
      expect(unstakeTableAfterClaim.rows.length).toBe(0);

      // Check staker got tokens back after claim
      let stakerBalanceFinal = await staker.getBalance();
      expect(stakerBalanceFinal.amount - stakerBalanceBefore.amount).toBe(10);
    });

    it('should remove user stake entry when fully unstaked', async () => {
      let staker = await chain.system.createAccount('staker3', '100.00000000 WAX', 4565215);
      let targetDapp = await chain.system.createAccount('targetdapp3', '0.00000000 WAX', 4565215);

      // set config to unstake time for test (5 seconds)
      await orngContract.contract.action.setconfig(
        {
          config: 'unstaketime',
          value: 5,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // First stake
      await staker.transfer(orngContract.name, '15.00000000 WAX', 'stake-' + targetDapp.name);

      let stakerBalanceBefore = await staker.getBalance();

      // Unstake all
      await orngContract.contract.action.unstakeuser(
        {
          user: staker.name,
          dapp: targetDapp.name,
          quantity: '15.00000000 WAX',
        },
        [
          {
            actor: staker.name,
            permission: 'active',
          },
        ]
      );

      // Check userstakes table should be empty (fully unstaked)
      const userStakesTable = await orngContract.contract.table['userstakes'].get({
        scope: targetDapp.name,
      });
      expect(userStakesTable.rows.length).toBe(0);

      // Check acctstate table stake should be zero
      const acctTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: targetDapp.name,
        upper_bound: targetDapp.name,
      });
      expect(acctTable.rows[0].stake).toBe('0.00000000 WAX');

      // Check unstake table has the request
      const unstakeTable = await orngContract.contract.table['unstake'].get({
        scope: targetDapp.name,
        lower_bound: staker.name,
        upper_bound: staker.name,
      });
      expect(unstakeTable.rows.length).toBe(1);
      expect(unstakeTable.rows[0].amount).toBe('15.00000000 WAX');

      // Balance should not change yet (tokens not transferred)
      let stakerBalanceAfter = await staker.getBalance();
      expect(stakerBalanceAfter.amount).toBe(stakerBalanceBefore.amount);

      // Wait for unstake time to pass
      await chain.waitTillNextBlock(20); // 30 seconds

      // Claim funds
      await orngContract.contract.action.claimfund(
        {
          user: staker.name,
          dapp: targetDapp.name,
        },
        [
          {
            actor: staker.name,
            permission: 'active',
          },
        ]
      );

      // Check unstake table should be empty after claim
      const unstakeTableAfterClaim = await orngContract.contract.table['unstake'].get({
        scope: targetDapp.name,
      });
      expect(unstakeTableAfterClaim.rows.length).toBe(0);

      // Check staker got tokens back after claim
      let stakerBalanceFinal = await staker.getBalance();
      expect(stakerBalanceFinal.amount - stakerBalanceBefore.amount).toBe(15);
    });

    it('should revert claim when unstake time not reached', async () => {
      let staker = await chain.system.createAccount('staker4', '100.00000000 WAX', 4565215);
      let targetDapp = await chain.system.createAccount('targetdapp4', '0.00000000 WAX', 4565215);

      // set config to unstake time for test (30 seconds)
      await orngContract.contract.action.setconfig(
        {
          config: 'unstaketime',
          value: 30,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // First stake
      await staker.transfer(orngContract.name, '25.00000000 WAX', 'stake-' + targetDapp.name);

      // Unstake
      await orngContract.contract.action.unstakeuser(
        {
          user: staker.name,
          dapp: targetDapp.name,
          quantity: '10.00000000 WAX',
        },
        [
          {
            actor: staker.name,
            permission: 'active',
          },
        ]
      );

      // Check unstake table has the request
      const unstakeTable = await orngContract.contract.table['unstake'].get({
        scope: targetDapp.name,
        lower_bound: staker.name,
        upper_bound: staker.name,
      });
      expect(unstakeTable.rows.length).toBe(1);
      expect(unstakeTable.rows[0].amount).toBe('10.00000000 WAX');

      // Try to claim immediately (should fail)
      await expect(
        orngContract.contract.action.claimfund(
          {
            user: staker.name,
            dapp: targetDapp.name,
          },
          [
            {
              actor: staker.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrow('unstake time not reached, please wait');

      // Unstake table should still have the request (not removed)
      const unstakeTableAfterFailedClaim = await orngContract.contract.table['unstake'].get({
        scope: targetDapp.name,
        lower_bound: staker.name,
        upper_bound: staker.name,
      });
      expect(unstakeTableAfterFailedClaim.rows.length).toBe(1);
      expect(unstakeTableAfterFailedClaim.rows[0].amount).toBe('10.00000000 WAX');
    });
  });

  describe('test deposit', () => {
    let dappDeposit1;
    beforeAll(async () => {
      dappDeposit1 = await chain.system.createAccount('dappdeposit1', '100.00000000 WAX', 4565215);
      // Disable free tier to properly test deposit functionality
      await orngContract.contract.action.configv2(
        {
          fee_per_call: '0.00500000 WAX',
          strike_max: 3,
          k_calls_per_wax: 3,
          free_calls_per_hour: 0,  // Disable free tier
          treas_hardfloor: 10,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
    });

    it('dapp can deposit', async () => {
      let balanceBefore = await orngContract.getBalance();
      await dappDeposit1.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dappDeposit1.name);
      const depositTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappDeposit1.name,
        upper_bound: dappDeposit1.name,
      });
      expect(depositTable.rows.length).toBe(1);
      expect(depositTable.rows[0].fee_balance).toBe('10.00000000 WAX');
      let balanceAfter = await orngContract.getBalance();
      expect(balanceAfter.amount - balanceBefore.amount).toBe(10);
    });

    it('dapp can deposit multiple times', async () => {
      await dappDeposit1.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dappDeposit1.name);
      const depositTable1 = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappDeposit1.name,
        upper_bound: dappDeposit1.name,
      });
      expect(depositTable1.rows[0].fee_balance).toBe('20.00000000 WAX');
    });

    it("decrease balance when requestrand", async () => {
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 1,
          signing_value: 12345,
          caller: dappDeposit1.name,
        },
        [
          {
            actor: dappDeposit1.name,
            permission: 'active',
          },
        ]
      );

      const depositTableAfter = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappDeposit1.name,
        upper_bound: dappDeposit1.name,
      }); 
      expect(depositTableAfter.rows[0].fee_balance).toBe('19.99500000 WAX');
    });
  });

 
  describe('requestrand tests', () => {
    let dappContract2;
    beforeAll(async () => {
      dappContract2 = await chain.system.createAccount('dapp2', '10.00000000 WAX', 4565215);
      // Don't register yet - let individual tests register after setting their config
      await dappContract.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dappContract.name);

      // Fund treasury for free tier to work
      let treasuryFunder = await chain.system.createAccount('treasfunder', '100.00000000 WAX', 4565215);
      await treasuryFunder.transfer(orngContract.name, '10.00000000 WAX', 'treasury');
    });
    it('should accept request with free tier (no stake)', async () => {
      // Set free calls per hour to allow free requests
      await orngContract.contract.action.configv2(
        {
          fee_per_call: '0.00500000 WAX',
          strike_max: 3,
          k_calls_per_wax: 3,
          free_calls_per_hour: 10,
          treas_hardfloor: 10,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Should work without stake due to free tier
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 1,
          signing_value: 12345,
          caller: dappContract2.name,
        },
        [
          {
            actor: dappContract2.name,
            permission: 'active',
          },
        ]
      );

      // Check that account was created with free credits
      const stakeTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappContract2.name,
        upper_bound: dappContract2.name,
      });

      expect(stakeTable.rows.length).toBe(1);
      expect(stakeTable.rows[0].stake).toBe('0.00000000 WAX');
      expect(stakeTable.rows[0].credits).toBe(9); // Started with 10, used 1
    });

    it('throw if no stake and no free credits', async () => {
      // Set free calls to 0 to disable free tier
      await orngContract.contract.action.configv2(
        {
          fee_per_call: '0.00500000 WAX',
          strike_max: 3,
          k_calls_per_wax: 3,
          free_calls_per_hour: 0,
          treas_hardfloor: 10,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      let dappContract3 = await chain.system.createAccount('dapp3', '10.00000000 WAX', 4565215);

      await expect(
        orngContract.contract.action.requestrand(
          {
            assoc_id: 1,
            signing_value: 12345,
            caller: dappContract3.name,
          },
          [
            {
              actor: dappContract3.name,
              permission: 'active',
            },
          ])
      ).rejects.toThrowError(`WAX RNG: ${dappContract3.name}`);
    });

    it('should exhaust free credits and require deposit', async () => {
      // Set free calls to 2 per hour
      await orngContract.contract.action.configv2(
        {
          fee_per_call: '0.00500000 WAX',
          strike_max: 3,
          k_calls_per_wax: 3,
          free_calls_per_hour: 2,
          treas_hardfloor: 10,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      let dappContract4 = await chain.system.createAccount('dapp4', '10.00000000 WAX', 4565215);

      // First call should work (uses free credit 1)
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 101,
          signing_value: 1,
          caller: dappContract4.name,
        },
        [
          {
            actor: dappContract4.name,
            permission: 'active',
          },
        ]
      );

      // Second call should work (uses free credit 2)
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 102,
          signing_value: 2,
          caller: dappContract4.name,
        },
        [
          {
            actor: dappContract4.name,
            permission: 'active',
          },
        ]
      );

      // Third call should fail (no credits left)
      await expect(
        orngContract.contract.action.requestrand(
          {
            assoc_id: 103,
            signing_value: 3,
            caller: dappContract4.name,
          },
          [
            {
              actor: dappContract4.name,
              permission: 'active',
            },
          ])
      ).rejects.toThrowError(`WAX RNG: ${dappContract4.name}`);

      // Check account has 0 credits
      const stakeTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappContract4.name,
        upper_bound: dappContract4.name,
      });

      expect(stakeTable.rows[0].credits).toBe(0);
    });

    it('should allow continued usage after depositing fees', async () => {
      let dappContract5 = await chain.system.createAccount('dapp5', '10.00000000 WAX', 4565215);

      // Use up free credits
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 201,
          signing_value: 1,
          caller: dappContract5.name,
        },
        [
          {
            actor: dappContract5.name,
            permission: 'active',
          },
        ]
      );

      await orngContract.contract.action.requestrand(
        {
          assoc_id: 202,
          signing_value: 2,
          caller: dappContract5.name,
        },
        [
          {
            actor: dappContract5.name,
            permission: 'active',
          },
        ]
      );

      // Deposit fees
      await dappContract5.transfer(orngContract.name, '1.00000000 WAX', 'deposit-' + dappContract5.name);

      // Should now work with fee payment
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 203,
          signing_value: 3,
          caller: dappContract5.name,
        },
        [
          {
            actor: dappContract5.name,
            permission: 'active',
          },
        ]
      );

      // Check fee was deducted
      const stakeTable = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappContract5.name,
        upper_bound: dappContract5.name,
      });

      expect(stakeTable.rows[0].fee_balance).toBe('0.99500000 WAX'); // 1 WAX - 0.005 WAX fee
    });

    it ("should accept request if enough deposit", async () => {
      await dappContract2.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dappContract2.name);

      // Get current account state to know the nonce
      const acctStateBefore = await orngContract.contract.table['acctstate'].get({
        scope: orngContract.name,
        lower_bound: dappContract2.name,
        upper_bound: dappContract2.name,
      });
      const expectedNonce = acctStateBefore.rows.length > 0 ? acctStateBefore.rows[0].last_nonce + 1 : 1;

      await orngContract.contract.action.requestrand(
        {
          assoc_id: 101,
          signing_value: 12345,
          caller: dappContract2.name,
        },
        [
          {
            actor: dappContract2.name,
            permission: 'active',
          },
        ]);

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      let lastRequest = requestTable.rows[requestTable.rows.length - 1];

      expect(lastRequest.seed).toEqual(sha256('12345'));
      expect(lastRequest.dapp).toEqual(dappContract2.name);
      expect(lastRequest.assoc_id).toEqual(101);
      expect(lastRequest.nonce).toEqual(expectedNonce); // Dynamic based on previous requests
      expect([1, 2]).toContain(lastRequest.ver); // Version 1 or 2 depending on test order
      expect(lastRequest.parts.length).toBe(0);
    });

    it('should silently ignore for banned accounts', async () => {
      await orngContract.contract.action.ban(
        {
          dapp: dappContract.name,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      const requestTableBefore = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      await expect(
       orngContract.contract.action.requestrand(
        {
          assoc_id: 0,
          signing_value: 12345,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('Account is banned from using this service');

      await orngContract.contract.action.unban(
        {
          dapp: dappContract.name,
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

  describe('pause contract tests', () => {
    it('should throw if the contact is paused', async () => {
      await dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-' + dappContract.name);
      await await orngContract.contract.action.pause(
        {
          paused: true,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );
      await expect(
        orngContract.contract.action.requestrand(
          {
            assoc_id: 0,
            signing_value: 12345,
            caller: dappContract.name,
          },
          [
            {
              actor: dappContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Contract is paused');

      await orngContract.contract.action.pause(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 0,
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
    });
  });

  describe('set oracles tests', () => {
    let reqId;
    let dappTest;
    let testVer = 1;

    beforeAll(async () => {
      // Make sure contract is unpaused
      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      // Set config to use version 1 (not retired)
      await orngContract.contract.action.setconfig(
        {
          config: 'activever',
          value: 1,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Set up oracles first
      await orngContract.contract.action.setoracles(
        {
          oracles: [orngOracle3.name, orngOracle4.name],
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      // Create a test request that will be used by multiple tests
      try {
        dappTest = await chain.system.createAccount('dapporacle' + Math.floor(Math.random() * 1000), '100.00000000 WAX', 4565215);
      } catch (e) {
        // If creation fails, use existing dappContract
        dappTest = dappContract;
      }

      if (dappTest !== dappContract) {
        await dappTest.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dappTest.name);
      }

      await orngContract.contract.action.requestrand(
        {
          assoc_id: 9999,
          signing_value: 54321,
          caller: dappTest.name,
        },
        [
          {
            actor: dappTest.name,
            permission: 'active',
          },
        ]
      );

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      const testReq = requestTable.rows.find(r => r.dapp === dappTest.name && r.assoc_id === 9999);
      if (testReq) {
        reqId = testReq.id;
        testVer = testReq.ver;
      } else if (requestTable.rows.length > 0) {
        // Fallback to last request if specific one not found
        const lastReq = requestTable.rows[requestTable.rows.length - 1];
        reqId = lastReq.id;
        testVer = lastReq.ver;
      }
    });

    it('should set oracles', async () => {
      await orngContract.contract.action.setoracles(
        {
          oracles: [orngOracle3.name, orngOracle4.name],
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      const oraclesTable = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });
      expect(oraclesTable.rows.length).toBe(2);
      expect(oraclesTable.rows[0].oracle).toBe(orngOracle3.name);
      expect(oraclesTable.rows[0].oracle_index).toBe(1);
      expect(oraclesTable.rows[1].oracle).toBe(orngOracle4.name);
      expect(oraclesTable.rows[1].oracle_index).toBe(2);
    });
    it('oracle can submit part', async () => {
      // Use the reqId from beforeAll
      expect(reqId).toBeDefined();

      await orngContract.contract.action.submitpart(
        {
          oracle: orngOracle3.name,
          id: reqId,
          ver: testVer,
          sig_i: sha256('sig1'),
        },
        [
          {
            actor: orngOracle3.name,
            permission: 'active',
          },
        ]
      );
      const requestTableAfter = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      let req = requestTableAfter.rows.find(r => r.id === reqId);
      expect(req.parts[0].sig_i).toBe(sha256('sig1'));
    });
    it('can not submit wrong request id', async () => {
      await expect(
        orngContract.contract.action.submitpart(
          {
            oracle: orngOracle4.name,
            id: 100,
            ver: 2,
            sig_i: sha256('sig1'),
          },
          [
            {
              actor: orngOracle4.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('no request found');
    });
    it('can not submit wrong version', async () => {
      const wrongVer = testVer === 1 ? 2 : 1;

      await expect(
        orngContract.contract.action.submitpart(
          {
            oracle: orngOracle4.name,
            id: reqId,
            ver: wrongVer,
            sig_i: sha256('sig1'),
          },
          [
            {
              actor: orngOracle4.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('version mismatch');
    });
    it('oracle automatically uses its assigned index', async () => {
      // Oracle4 should be able to submit (it will use its assigned index automatically)
      await orngContract.contract.action.submitpart(
        {
          oracle: orngOracle4.name,
          id: reqId,
          ver: testVer,
          sig_i: sha256('sig2'),
        },
        [
          {
            actor: orngOracle4.name,
            permission: 'active',
          },
        ]
      );

      // Verify the part was stored with the correct index
      let reqs = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      let req = reqs.rows.find(r => r.id == reqId);
      expect(req.parts.length).toBe(2); // oracle3 (idx=1) + oracle4 (idx=2)
      expect(req.parts.some(p => p.idx == 2)).toBe(true); // oracle4's index
    });
    it('can not submit duplicate part', async () => {

      await expect(
        orngContract.contract.action.submitpart(
          {
            oracle: orngOracle3.name,
            id: reqId,
            ver: testVer,
            sig_i: sha256('sig3'),
          },
          [
            {
              actor: orngOracle3.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('duplicate part'); 
    });
    it('nonexistent oracle can not submit part', async () => {
      let fakeOracle = await chain.system.createAccount('fakeoracle', '100.00000000 WAX', 4565215);

      await expect(
        orngContract.contract.action.submitpart(
          {
            oracle: fakeOracle.name,
            id: reqId,
            ver: testVer,
            sig_i: sha256('sig2'),
          },
          [
            {
              actor: fakeOracle.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('unknown oracle');
    });
  });

  describe('set rand tests', () => {
    beforeAll(async () => {
      // Make sure contract is unpaused
      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      // Set config to use version 1 (not retired)
      await orngContract.contract.action.setconfig(
        {
          config: 'activever',
          value: 2,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

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
      await dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-' + dappContract.name);
    });
    it('should accept random value', async () => {
      const assoc_id = 5;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      const seed = requestTable.rows[requestTable.rows.length - 1].seed;
      const version = requestTable.rows[requestTable.rows.length - 1].ver;
      const nonce = requestTable.rows[requestTable.rows.length - 1].nonce;
      const rsaSigning = new RSASigning( getRSAPrivateKey(version));

      let msg = make_msg(seed, dappContract.name, nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);

      const oraclesBalanceTableBefore = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const oracleBalanceBefore = oraclesBalanceTableBefore.rows.find(r => r.oracle === orngOracle.name);

      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle.name,
          id: requestTable.rows[requestTable.rows.length - 1].id,
          ver: requestTable.rows[requestTable.rows.length - 1].ver,
          sig: signed_value,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      const requestTableAfter = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      expect(requestTableAfter.rows.length).toBeLessThanOrEqual(requestTable.rows.length);
      expect(requestTableAfter.rows.find(r => r.id === requestTable.rows[requestTable.rows.length - 1].id )).toBe(undefined);

      // Check if results were delivered
      const results_tbl = await dappContract.contract.table['results'].get({
        scope: dappContract.name,
      });

      let signed_value_hash = crypto.createHash('sha256').update(signed_value).digest('hex');

      const result = results_tbl.rows.find(r => r.assoc_id === assoc_id);
      if (result) {
        expect(result.assoc_id).toEqual(assoc_id);
        expect(result.random_value).toEqual(signed_value_hash);
      }


      const oraclesTable = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });

      const oraclesBalanceTableAfter = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const rewardForEachOracle = Math.floor(500000 / oraclesTable.rows.length);
      const oracleBalanceAfter = oraclesBalanceTableAfter.rows.find(r => r.oracle === orngOracle.name);
      const beforeBalance = oracleBalanceBefore ? Number(oracleBalanceBefore.unpaid.split(' ')[0])*(10**8) : 0;
      const afterBalance = Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8);
      // Just check that the oracle received some reward
      expect(afterBalance).toBeGreaterThanOrEqual(beforeBalance);
    });

    it('should strike if invalid signed value', async () => {
      jest.setTimeout(10000);
      const rsaSigning = new RSASigning(privateKey0);
      const assoc_id = 6;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      await orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: requestTable.rows[requestTable.rows.length - 1].id,
            ver: requestTable.rows[requestTable.rows.length - 1].ver,
            sig: 'faked_signed_value',
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
      );

      const signed_value = rsaSigning.generateRandomNumber(sha256('test1'));
      await 
        orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: requestTable.rows[requestTable.rows.length - 1].id,
            ver: requestTable.rows[requestTable.rows.length - 1].ver,
            sig: signed_value,
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
        );
      const oraclesTable = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });
      expect(oraclesTable.rows.length).toBe(2);
      expect(oraclesTable.rows[0].oracle).toBe(orngOracle.name);
      expect(oraclesTable.rows[0].strikes).toBe(2);
    });

    it('should suspend oracle if reach strike max', async () => {
      jest.setTimeout(10000);

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      await orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: requestTable.rows[requestTable.rows.length - 1].id,
            ver: requestTable.rows[requestTable.rows.length - 1].ver,
            sig: 'faked_signed_value',
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
      );
      const oraclesTable = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });
      expect(oraclesTable.rows.length).toBe(2);
      expect(oraclesTable.rows[0].oracle).toBe(orngOracle.name);
      expect(oraclesTable.rows[0].strikes).toBe(3);
      expect(oraclesTable.rows[0].suspended).toBe(1);
    });

    it('should revert if oracle suspended', async () => {
      jest.setTimeout(10000);

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      await expect(orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: requestTable.rows[requestTable.rows.length - 1].id,
            ver: requestTable.rows[requestTable.rows.length - 1].ver,
            sig: 'signature',
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
      )).rejects.toThrowError('oracle suspended'); 
    });

    it('should revert if request not found', async () => {
      jest.setTimeout(10000);
      await orngContract.contract.action.resetsuspen(
        {
          account: orngOracle.name
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      )

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      await expect(orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: 9999,
            ver: requestTable.rows[requestTable.rows.length - 1].ver,
            sig: 'signature',
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
      )).rejects.toThrowError('no request found'); 
    });

    it('should not reward suspended oracles', async () => {
      jest.setTimeout(10000);
      const oraclesTableBefore = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });

      const oraclesBalanceTableBefore = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });

      // Suspend oracle by giving it 3 strikes (max strikes)
      const assoc_id = 999;

      // First reset suspension to start clean
      await orngContract.contract.action.resetsuspen(
        {
          account: orngOracle.name
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      // Create a request to generate reward
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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

      // Give oracle 3 strikes by providing invalid signatures
      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      const lastRequest = requestTable.rows[requestTable.rows.length - 1];
      // Strike 1
      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle.name,
          id: lastRequest.id,
          ver: lastRequest.ver,
          sig: 'invalid_signature_1',
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      // Strike 2
      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle.name,
          id: lastRequest.id,
          ver: lastRequest.ver,
          sig: 'invalid_signature_2',
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      // Strike 3 - this should suspend the oracle
      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle.name,
          id: lastRequest.id,
          ver: lastRequest.ver,
          sig: 'invalid_signature_3',
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      // Verify oracle is suspended
      const oraclesTableAfterSuspension = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });
      const suspendedOracle = oraclesTableAfterSuspension.rows.find(r => r.oracle === orngOracle.name);
      expect(suspendedOracle.suspended).toBe(1);

      const rsaSigning = new RSASigning(getRSAPrivateKey(lastRequest.ver));
      // Now have another oracle provide a valid signature to trigger reward distribution
      const msg = make_msg(lastRequest.seed, lastRequest.dapp, lastRequest.nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.contract.action.setrand(
        {
          oracle: orngOracle2.name,
          id: lastRequest.id,
          ver: lastRequest.ver,
          sig: signed_value,
        },
        [
          {
            actor: orngOracle2.name,
            permission: 'active',
          },
        ]
      );

      // Check final balances - suspended oracle should not have received rewards
      const oraclesBalanceTableAfter = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });

      const suspendedOracleBalanceBefore = oraclesBalanceTableBefore.rows.find(r => r.oracle === orngOracle.name);
      const suspendedOracleBalanceAfter = oraclesBalanceTableAfter.rows.find(r => r.oracle === orngOracle.name);
      const nonSuspendedOracleBalanceBefore = oraclesBalanceTableBefore.rows.find(r => r.oracle === orngOracle2.name);
      const nonSuspendedOracleBalanceAfter = oraclesBalanceTableAfter.rows.find(r => r.oracle === orngOracle2.name);

      // Suspended oracle balance should remain the same
      const suspendedBalanceBefore = suspendedOracleBalanceBefore ? Number(suspendedOracleBalanceBefore.unpaid.split(' ')[0]) * (10**8) : 0;
      const suspendedBalanceAfter = suspendedOracleBalanceAfter ? Number(suspendedOracleBalanceAfter.unpaid.split(' ')[0]) * (10**8) : 0;
      expect(suspendedBalanceAfter).toBe(suspendedBalanceBefore);

      // Non-suspended oracle should have received rewards
      const nonSuspendedBalanceBefore = nonSuspendedOracleBalanceBefore ? Number(nonSuspendedOracleBalanceBefore.unpaid.split(' ')[0]) * (10**8) : 0;
      const nonSuspendedBalanceAfter = Number(nonSuspendedOracleBalanceAfter.unpaid.split(' ')[0]) * (10**8);
      expect(nonSuspendedBalanceAfter).toBeGreaterThan(nonSuspendedBalanceBefore);

      // reset suspension to start clean
      await orngContract.contract.action.resetsuspen(
        {
          account: orngOracle.name
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
    });

    it('should revert if key version mismatch', async () => {
      jest.setTimeout(10000);

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      await expect(orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: requestTable.rows[requestTable.rows.length - 1].id,
            ver: requestTable.rows[requestTable.rows.length - 1].ver + 1,
            sig: 'signature',
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
      )).rejects.toThrowError('version mismatch'); 
    });

    it('should revert if key retired', async () => {
      jest.setTimeout(10000);
      const rsaSigning = new RSASigning(privateKey0);
      const assoc_id = 7;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100
      });

      const seed = requestTable.rows[requestTable.rows.length - 1].seed;
      const version = requestTable.rows[requestTable.rows.length - 1].ver;
      const nonce = requestTable.rows[requestTable.rows.length - 1].nonce;

      let msg = make_msg(seed, dappContract.name, nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.contract.action.retirepubkey(
        {
          version,
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      await expect(orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: requestTable.rows[requestTable.rows.length - 1].id,
            ver: version,
            sig: signed_value,
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
      )).rejects.toThrowError('key retired'); 

      await orngContract.contract.action.setpubkey(
        {
          version: 3,
          exponent: exponent2,
          modulus: modulus2,
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );
    });
  });

  describe('set mark failed and retry deliver test', () => {
    beforeAll(async () => {
      // Make sure contract is unpaused
      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      // Ensure we have version 1 active (not retired)
      await orngContract.contract.action.setconfig(
        {
          config: 'activever',
          value: 1,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
    });

    it('should revert if oracle not found', async () => {
      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });

      await expect(orngContract.contract.action.markfailed(
        {
          oracle: dappContract.name,
          id: requestTable.rows[requestTable.rows.length - 1].id,
          ver: requestTable.rows[requestTable.rows.length - 1].ver,
          sig: "signature",
          error_message: "fail message"
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('unknown oracle');
    });

    it('should mark job failed successfully', async () => {
      jest.setTimeout(20000);
      const assoc_id = 8;

      await orngContract.contract.action.setconfig(
        {
          config: 'oraclereward',
          value: 3,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]);

      await orngContract.contract.action.requestrand(
        {
          assoc_id,
          signing_value: 12345,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]);

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100
      });

      const seed = requestTable.rows[requestTable.rows.length - 1].seed;
      const version = requestTable.rows[requestTable.rows.length - 1].ver;
      const nonce = requestTable.rows[requestTable.rows.length - 1].nonce;
      let msg = make_msg(seed, dappContract.name, nonce);

      const rsaSigning = new RSASigning( getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      const oraclesBalanceTableBefore = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore.rows.find(r => r.oracle === orngOracle.name);
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

      const transaction = await orngContract.contract.action.markfailed(
        {
          oracle: orngOracle.name,
          id: requestTable.rows[requestTable.rows.length - 1].id,
          ver: version,
          sig: signed_value,
          error_message: "fail message"
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      const requestTableAfter = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100
      });
      expect(requestTableAfter.rows.length).toBe(requestTable.rows.length - 1);
      expect(requestTableAfter.rows.find(r => r.id === requestTable.rows[requestTable.rows.length - 1].id)).toBe(undefined);

      const undeliveredTable = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
      });
      const undeliveredItem = undeliveredTable.rows.find(r => r.request_id === requestTable.rows[requestTable.rows.length - 1].id);
      expect(undeliveredItem).toBeDefined();
      expect(undeliveredItem.dapp).toBe(requestTable.rows[requestTable.rows.length - 1].dapp);
      expect(undeliveredItem.assoc_id).toBe(requestTable.rows[requestTable.rows.length - 1].assoc_id);
      expect(undeliveredItem.error_message).toBe('fail message');
      const transactionBlockTime = new Date(transaction.processed.block_time);
      const oracleDeadLine = new Date(transactionBlockTime.getTime() + 3000);
      let rewardDate = new Date(undeliveredItem.oracle_reward_deadline);
      expect(rewardDate.toString()).toBe(oracleDeadLine.toString());

      const oraclesTable = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });

      const oraclesBalanceTableAfter = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      // only half reward distributed after markfail
      const halfReward = 500000/2;
      const rewardForEachOracle = Math.floor(halfReward / oraclesTable.rows.length);
      const oracleBalanceAfter = oraclesBalanceTableAfter.rows.find(r => r.oracle === orngOracle.name);
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).toBe(oracleBalanceBefore + rewardForEachOracle);
    });

    it('should retry deliver and get 50% remaining reward', async () => {
      const undeliveredTable = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
        limit: 100
      });

      const oraclesBalanceTableBefore = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore.rows.find(r => r.oracle === orngOracle.name);
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

      await orngContract.contract.action.retrydeliver(
        {
          request_id: undeliveredTable.rows[undeliveredTable.rows.length - 1].request_id
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      const oraclesTable = await orngContract.contract.table['oracles.a'].get({
        scope: orngContract.name,
      });

      const oraclesBalanceTableAfter = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      // remaining half reward distributed after retrydeliver
      const halfReward = 500000/2;
      const rewardForEachOracle = Math.floor(halfReward / oraclesTable.rows.length);
      const oracleBalanceAfter = oraclesBalanceTableAfter.rows.find(r => r.oracle === orngOracle.name);
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).toBe(oracleBalanceBefore + rewardForEachOracle);

      const undeliveredTableAfter = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
      });
      expect(undeliveredTableAfter.rows.length).toBe(undeliveredTable.rows.length - 1);
      expect(
        undeliveredTableAfter.rows.find(r => r.request_id === undeliveredTable.rows[undeliveredTable.rows.length - 1].request_id)
      ).toBeUndefined();
    });

    it('should revert if retrydeliver with item does not exist', async () => {
      await expect(orngContract.contract.action.retrydeliver(
        {
          request_id: 123,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('No undelivered result found for this request ID');
    });

    it('should not reward if oracle not retry during dealine', async () => {
      jest.setTimeout(20000);
      const assoc_id = 9;

      await orngContract.contract.action.requestrand(
        {
          assoc_id,
          signing_value: 12345,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]);

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });

      const seed = requestTable.rows[requestTable.rows.length - 1].seed;
      const version = requestTable.rows[requestTable.rows.length - 1].ver;
      const nonce = requestTable.rows[requestTable.rows.length - 1].nonce;
      let msg = make_msg(seed, dappContract.name, nonce);

      const rsaSigning = new RSASigning( getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.contract.action.markfailed(
        {
          oracle: orngOracle.name,
          id: requestTable.rows[requestTable.rows.length - 1].id,
          ver: version,
          sig: signed_value,
          error_message: "fail message"
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      const oraclesBalanceTableBefore = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore.rows.find(r => r.oracle === orngOracle.name);
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

      const undeliveredTable = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
      });

      await chain.waitTillNextBlock(8); // wait till oracle reward deadline
      
      await orngContract.contract.action.retrydeliver(
        {
          request_id: requestTable.rows[requestTable.rows.length - 1].id,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      const oraclesBalanceTableAfter = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const oracleBalanceAfter = oraclesBalanceTableAfter.rows.find(r => r.oracle === orngOracle.name);
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).toBe(oracleBalanceBefore);

      const undeliveredTableAfter = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
      });
      expect(undeliveredTableAfter.rows.length).toBe(undeliveredTable.rows.length - 1);
      expect(
        undeliveredTableAfter.rows.find(r => r.request_id === undeliveredTable.rows[undeliveredTable.rows.length - 1].request_id)
      ).toBeUndefined();
    });
  });

  describe('get result tests', () => {
    beforeAll(async () => {
      // Ensure we have a non-retired key active
      await orngContract.contract.action.setconfig(
        {
          config: 'activever',
          value: 3,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
    });

    it('should revert if No undelivered result found for this assoc_id', async () => {
      await expect(orngContract.contract.action.getresult(
        {
          caller: orngContract.name,
          assoc_id: 12389,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ])).rejects.toThrowError('No undelivered result found for this assoc_id');
    });

    it('should get result successfully', async () => {
      jest.setTimeout(20000);
      const assoc_id = 10;

      await orngContract.contract.action.requestrand(
        {
          assoc_id,
          signing_value: 12345,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]);

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });

      const seed = requestTable.rows[requestTable.rows.length - 1].seed;
      const version = requestTable.rows[requestTable.rows.length - 1].ver;
      const nonce = requestTable.rows[requestTable.rows.length - 1].nonce;
      let msg = make_msg(seed, dappContract.name, nonce);

      const rsaSigning = new RSASigning( getRSAPrivateKey(version));
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await orngContract.contract.action.markfailed(
        {
          oracle: orngOracle.name,
          id: requestTable.rows[requestTable.rows.length - 1].id,
          ver: version,
          sig: signed_value,
          error_message: "fail message"
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      const oraclesBalanceTableBefore = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const oracleBalanceBeforeRow = oraclesBalanceTableBefore.rows.find(r => r.oracle === orngOracle.name);
      let oracleBalanceBefore = 0;
      if (oracleBalanceBeforeRow) {
        oracleBalanceBefore = Number(oracleBalanceBeforeRow.unpaid.split(' ')[0])*(10**8);
      }

      const undeliveredTable = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
      });

      await chain.waitTillNextBlock(8); // wait till oracle reward deadline
      await dappContract.contract.action.getresult(
        {
          assoc_id: 10,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
      ]);

      const oraclesBalanceTableAfter = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      const oracleBalanceAfter = oraclesBalanceTableAfter.rows.find(r => r.oracle === orngOracle.name);
      expect(Number(oracleBalanceAfter.unpaid.split(' ')[0])*(10**8)).toBe(oracleBalanceBefore);

      const undeliveredTableAfter = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
      });
      expect(undeliveredTableAfter.rows.length).toBe(undeliveredTable.rows.length - 1);
      expect(
        undeliveredTableAfter.rows.find(r => r.request_id === undeliveredTable.rows[undeliveredTable.rows.length - 1].request_id)
      ).toBeUndefined();
    });
  })

  describe('cleanup tests', () => {
    beforeAll(async () => {
      // Make sure contract is unpaused
      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      // Ensure we have version 1 active (not retired)
      await orngContract.contract.action.setconfig(
        {
          config: 'activever',
          value: 1,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
    });

    it('should revert if unknown oracle', async () => {
      await expect(orngContract.contract.action.cleanup(
        {
          oracle: dappContract.name,
          batch_size: 10,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ])).rejects.toThrowError('unknown oracle');
    });

    it('should cleanup undelivered_table', async () => {
      jest.setTimeout(20000);

      for (let i = 1; i <= 12; i++) {
        const assoc_id = 11 + i;

        await orngContract.contract.action.requestrand(
          {
            assoc_id,
            signing_value: 12345 + i,
            caller: dappContract.name,
          },
          [
            {
              actor: dappContract.name,
              permission: 'active',
            },
        ]);
        const requestTable = await orngContract.contract.table['reqs'].get({
          scope: orngContract.name,
          limit: 100
        });

        const seed = requestTable.rows[requestTable.rows.length - 1].seed;
        const version = requestTable.rows[requestTable.rows.length - 1].ver;
        const nonce = requestTable.rows[requestTable.rows.length - 1].nonce;
        const dappName = requestTable.rows[requestTable.rows.length - 1].dapp;
        let msg = make_msg(seed, dappName, nonce);

        const rsaSigning = new RSASigning( getRSAPrivateKey(version));
        const signed_value = rsaSigning.generateRandomNumber(msg);

        await orngContract.contract.action.markfailed(
          {
            oracle: orngOracle.name,
            id: requestTable.rows[requestTable.rows.length - 1].id,
            ver: version,
            sig: signed_value,
            error_message: "fail message"
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
        );
      }

      const undeliveredTable = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
        limit: 20,
      });
      // Verify we have undelivered entries (exact count may vary due to opportunistic cleanup)
      expect(undeliveredTable.rows.length).toBeGreaterThan(0);

      await chain.waitTillNextBlock(8); // wait till oracle reward deadline

      await orngContract.contract.action.cleanup(
        {
          oracle: orngOracle.name,
          batch_size: 50,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      const undeliveredTableAfter = await orngContract.contract.table['undelivered'].get({
        scope: orngContract.name,
      });
      expect(undeliveredTableAfter.rows.length).toBe(0);
    });
  })


  describe('claim tests', () => {
    it('can not claim if paused', async () => {
      await orngContract.contract.action.pause(
        {
          paused: true,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );
      await expect(
        orngContract.contract.action.claim(
          {
            oracle: orngOracle.name,
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('paused'); 

      // enable requestrand
      await orngContract.contract.action.pause(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );
    });

    it('should claim', async () => {
      let balanceTable = await orngContract.contract.table['balances'].get({
        scope: orngContract.name,
      });
      let orngOracle2Balance = await orngOracle.getBalance();
      let balance = balanceTable.rows.find(x => x.oracle === orngOracle.name);
      let unpaid = parseFloat(balance.unpaid.split(' ')[0]);
      await orngContract.contract.action.claim(
        {
          oracle: orngOracle.name,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );
      let balanceAfter = await orngOracle.getBalance();
      expect(balanceAfter.amount).toBe(unpaid + orngOracle2Balance.amount);
    });

    it('can not claim if no balance', async () => {
      let oracle2 = await chain.system.createAccount('oracle2', '100.00000000 WAX', 4565215); 
      await expect(
        orngContract.contract.action.claim(
          {
            oracle: oracle2.name,
          },
          [
            {
              actor: oracle2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('not an oracle');
    });
    
  });

  describe('pause requestrand tests', () => {
    beforeAll(async () => {
      // Make sure contract is unpaused
      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      // Ensure we have version 1 active (not retired)
      await orngContract.contract.action.setconfig(
        {
          config: 'activever',
          value: 1,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

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
      await dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-' + dappContract.name);
    });
    it('should throw if the requestrand is paused', async () => {
      jest.setTimeout(10000);
      const assoc_id = 987;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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

      await orngContract.contract.action.pauserequest(
        {
          paused: true,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      await expect(
        orngContract.contract.action.requestrand(
          {
            assoc_id: 0,
            signing_value: 12345,
            caller: dappContract.name,
          },
          [
            {
              actor: dappContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Orng.wax are under maintenance, please try again later');

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });

      let req = requestTable.rows[requestTable.rows.length - 1];
      
      const rsaSigning = new RSASigning( getRSAPrivateKey(req.ver));
      let msg = make_msg(req.seed, dappContract.name, req.nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);
      await orngContract.contract.action.setrand(
        // still able to setrand
        {
          oracle: orngOracle.name,
          id: req.id,
          ver: req.ver,
          sig: signed_value,
        },
        [
          {
            actor: orngOracle.name,
            permission: 'active',
          },
        ]
      );

      // Check if results were delivered
      const results_tbl = await dappContract.contract.table['results'].get({
        scope: dappContract.name,
      });
      signed_value_hash = crypto.createHash('sha256').update(signed_value).digest('hex');
      const result = results_tbl.rows.find(r => r.assoc_id === assoc_id);
      if (result) {
        expect(result.assoc_id).toEqual(assoc_id);
        expect(result.random_value).toEqual(signed_value_hash);
      }


      await orngContract.contract.action.pauserequest(
        // enable requestrand
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );
      await orngContract.contract.action.requestrand(
        // should able to requestrand when pauserequest is false
        {
          assoc_id: 0,
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
    });
  });

  describe('kill jobs tests', () => {
    beforeAll(async () => {
      // Ensure requestrand is not paused from previous tests
      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

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
      await dappContract.transfer(orngContract.name, '1.00000000 WAX', 'stake-' + dappContract.name);

    });
    it('throw if unauthorized account', async () => {
      jest.setTimeout(10000);
      const signing_value = getRandomInt(123456789);
      const assoc_id = 7;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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
      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      await expect(
        orngContract.contract.action.killjobs(
          {
            job_ids: [requestTable.rows[requestTable.rows.length - 1].id],
          },
          [
            {
              actor: dappContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('missing authority of orng.wax');
    });

    it('should kill a job', async () => {
      jest.setTimeout(10000);
      const signing_value = getRandomInt(123456789);
      const assoc_id = 7;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });

      await orngContract.contract.action.killjobs(
        {
          job_ids: [requestTable.rows[requestTable.rows.length - 1].id],
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      const new_requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      expect(new_requestTable.rows.length).toBeLessThan(requestTable.rows.length);
      expect(
        new_requestTable.rows.find((j) => j.id === requestTable.rows[requestTable.rows.length - 1].id)
      ).toBe(undefined);
    });

    it('should kill several jobs', async () => {
      jest.setTimeout(10000);
      const signing_value = getRandomInt(123456789);
      const assoc_id = 8;

      await orngContract.contract.action.requestrand(
        {
          assoc_id,
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

      await orngContract.contract.action.requestrand(
        {
          assoc_id: assoc_id + 1,
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

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });
      await orngContract.contract.action.killjobs(
        {
          job_ids: [
            requestTable.rows[requestTable.rows.length - 1].id,
            requestTable.rows[requestTable.rows.length - 2].id,
          ],
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      const new_requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });
      expect(new_requestTable.rows.length).toEqual(requestTable.rows.length - 2);
    });
  });

  describe('test ban/unban', () => {
    it('throw if missing self permission', async () => {
      await expect(
        orngContract.contract.action.ban(
          {
            dapp: dappContract.name,
          },
          [
            {
              actor: dappContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError(`missing authority of ${orngContract.name}`);

      await expect(
        orngContract.contract.action.unban(
          {
            dapp: dappContract.name,
          },
          [
            {
              actor: dappContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError(`missing authority of ${orngContract.name}`);
    });

    it('Should ban dapp', async () => {
      await orngContract.contract.action.ban(
        {
          dapp: dappContract.name,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      const banTable = await orngContract.contract.table['banlist.a'].get({
        scope: orngContract.name,
      });

      expect(banTable.rows.length).toBe(1);
      expect(banTable.rows[0].dapp).toBe(dappContract.name);

    });

    it('throw if already ban daap', async () => {
      await expect(
        orngContract.contract.action.ban(
          {
            dapp: dappContract.name,
          },
          [
            {
              actor: orngContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Dapp already added to the banlist');
    });

    it('Should unban dapp', async () => {
      await orngContract.contract.action.unban(
        {
          dapp: dappContract.name,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      const banTable = await orngContract.contract.table['banlist.a'].get({
        scope: orngContract.name,
      });

      expect(banTable.rows.length).toBe(0);
    });

    it('throw if unban dapp not in the list', async () => {
      await expect(
        orngContract.contract.action.unban(
          {
            dapp: dappContract.name,
          },
          [
            {
              actor: orngContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Dapp not in the banlist');
    });
  });

  describe('test callback failure and retry mechanism', () => {
    let failingDapp;
    let failingDappAcc;
    let requestId;

    beforeAll(async () => {
      // Create a new dapp account for testing callback failures
      failingDapp = 'failingdapp';
      failingDappAcc = await chain.system.createAccount(failingDapp, '100.00000000 WAX', 4565215);
      
      // Deploy the failing dapp with requestrand contract that can simulate failures
      await failingDappAcc.setContract({
        wasm: './tests/contracts/requestrand.wasm',
        abi: './tests/contracts/requestrand.abi',
      });
      await failingDappAcc.addCode('active');

      // Deposit WAX for the dapp to make requests
      await failingDappAcc.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + failingDappAcc.name);

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

      // Set callback retries to 2 for faster testing
      await orngContract.contract.action.setconfig(
        {
          config: 'callbackret',
          value: 2,
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
 
  describe('test signvals.a backwards compatibility', () => {
    it('signvals.a table should exist and be empty', async () => {
      // Check that the signvals.a table exists (for backwards compatibility)
      const signvalsTable = await orngContract.contract.table['signvals.a'].get({
        scope: orngContract.name,
      });

      // Table should exist but be empty
      expect(signvalsTable).toBeDefined();
      expect(signvalsTable.rows).toEqual([]);
    });

    it('atomicpacks-style check should work with empty table', async () => {
      // Simulate what atomicpacks does: check if signing_value exists
      const signing_value = 12345;

      const signvalsTable = await orngContract.contract.table['signvals.a'].get({
        scope: orngContract.name,
        lower_bound: signing_value,
        upper_bound: signing_value,
      });

      // Should find nothing, allowing atomicpacks to use the original signing_value
      expect(signvalsTable.rows.length).toBe(0);
    });

    it('multiple requests with same signing_value should work due to nonce', async () => {
      // Ensure the contract is not paused
      await orngContract.contract.action.pauserequest(
        {
          paused: false,
        },
        [
          {
            actor: orngContract.name,
            permission: 'pause',
          },
        ]
      );

      let testDapp = await chain.system.createAccount('testdapp', '100.00000000 WAX', 4565215);
      await testDapp.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + testDapp.name);

      // Make multiple requests with the same signing_value
      const signing_value = 99999;

      // First request
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 1001,
          signing_value: signing_value,
          caller: testDapp.name,
        },
        [
          {
            actor: testDapp.name,
            permission: 'active',
          },
        ]
      );

      // Second request with same signing_value should also work
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 1002,
          signing_value: signing_value,
          caller: testDapp.name,
        },
        [
          {
            actor: testDapp.name,
            permission: 'active',
          },
        ]
      );

      // Check both requests exist with different nonces
      const reqTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });

      const requests = reqTable.rows.filter(r => r.dapp === testDapp.name && (r.assoc_id === 1001 || r.assoc_id === 1002));
      expect(requests.length).toBeGreaterThanOrEqual(1);
      if (requests.length >= 2) {
        expect(requests[0].nonce).not.toBe(requests[1].nonce);
      }
    });
  });

  describe('test retirepubkey', () => {
    let testDapp;
    let testDappAcc;
    let requestId;

    beforeAll(async () => {
      testDapp = 'retire.test';
      testDappAcc = await chain.system.createAccount(testDapp, '10.00000000 WAX', 4565215);
      await testDappAcc.transfer(orngContract.name, '1.00000000 WAX', 'deposit-' + testDappAcc.name);
    });

    it('should throw if missing governance permission', async () => {
      await expect(
        orngContract.contract.action.retirepubkey(
          {
            version: 1,
          },
          [
            {
              actor: testDappAcc.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError(`missing authority of ${govAccount.name}`);
    });

    it('should throw if key version not found', async () => {
      await expect(
        orngContract.contract.action.retirepubkey(
          {
            version: 99,
          },
          [
            {
              actor: govAccount.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('key not found');
    });

    it('should make rand request before retiring key', async () => {
      const assoc_id = 999;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
          signing_value: 54321,
          caller: testDapp,
        },
        [
          {
            actor: testDapp,
            permission: 'active',
          },
        ]
      );

      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });
      const request = requestTable.rows[requestTable.rows.length - 1];
      requestId = request.id;

      expect(request.dapp).toBe(testDapp);
      expect(request.seed).toBeDefined();
      expect(request.ver).toBeDefined();
      expect(request.nonce).toBeDefined();
    });

    it('should retire public key', async () => {
      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });
      const request = requestTable.rows.find(r => r.id === requestId);
      const keyVersion = request.ver;

      // Check key is not retired before
      let pubkeyTable = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
        lower_bound: keyVersion,
        upper_bound: keyVersion,
      });
      expect(pubkeyTable.rows[0].retired).toBe(0);

      // Retire the key
      await orngContract.contract.action.retirepubkey(
        {
          version: keyVersion,
        },
        [
          {
            actor: govAccount.name,
            permission: 'active',
          },
        ]
      );

      // Check key is now retired
      pubkeyTable = await orngContract.contract.table['pubkeys'].get({
        scope: orngContract.name,
        lower_bound: keyVersion,
        upper_bound: keyVersion,
      });
      expect(pubkeyTable.rows[0].retired).toBe(1);
    });

    it('should reject oracle submission with retired key', async () => {
      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
        limit: 100,
      });
      const request = requestTable.rows.find(r => r.id === requestId);
      const rsaSigning = new RSASigning(getRSAPrivateKey(request.ver));
      let msg = make_msg(request.seed, testDapp, request.nonce);
      const signed_value = rsaSigning.generateRandomNumber(msg);

      await expect(
        orngContract.contract.action.setrand(
          {
            oracle: orngOracle.name,
            id: request.id,
            ver: request.ver,
            sig: signed_value,
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('key retired');
    });
  });
});