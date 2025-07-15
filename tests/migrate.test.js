const { Chain, Account } = require('qtest-js');

const crypto = require('crypto');
const fs = require('fs');
const { RSASigning } = require('./rsaSigning.js');

function stringHashToNum(str) {
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    let bytes = str.slice(i * 2, i * 2 + 2);
    const a = parseInt(bytes, 16) & 127;
    result = (result << BigInt(8)) + BigInt(a);
  }
  return result.toString();
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

describe('test migration smart contract', () => {
  let chain;
  let systemContract = 'eosio';
  let orngContract = 'orng.wax';
  let orngOracle = 'oracle.wax';
  let orngV1Oracle = 'oraclev1.wax';
  let dappContract = 'dapp.wax';
  let pauseAcc = 'pause.test';
  let payee = 'payee';
  let payer = 'payer';
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
  beforeAll(async () => {
    jest.setTimeout(20000);

    chain = await Chain.setupChain('WAX');

    [orngContract, orngOracle, orngV1Oracle, dappContract, pauseAcc, payee, payer] =
      await chain.system.createAccounts(
        [orngContract, orngOracle, orngV1Oracle, dappContract, pauseAcc, payee, payer],
        '10000.00000000 WAX'
      );

    await orngContract.setContract({
      abi: './tests/contracts/old/waxv1.orng.abi',
      wasm: './tests/contracts/old/waxv1.orng.wasm',
    });
    await orngContract.addCode('active');

    await dappContract.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });

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

    await orngContract.contract.action.setsigpubkey(
      {
        id: 0,
        exponent: exponent0,
        modulus: modulus0,
      },
      [
        {
          actor: orngOracle.name,
          permission: 'active',
        },
      ]
    );

    await orngContract.contract.action.setchance(
      // set chance to small number for easier to test
      {
        chance_to_switch: 10,
      },
      [
        {
          actor: orngOracle.name,
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
  });

  afterAll(async () => {
    await chain.clear();
  }, 10000);

  describe('migration test', () => {
    it('should migrate old jobs table into reqs table', async () => {
      jest.setTimeout(10000);
      const signing_value = getRandomInt(123456789);
      const assoc_id = 5;
      await orngContract.contract.action.requestrand(
        {
          assoc_id,
          signing_value,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      const jobs_tbl = await orngContract.contract.table['jobs.a'].get({
        scope: orngContract.name,
      });
      let job1 = jobs_tbl.rows[0];

      // migrate contract to new version
      await orngContract.setContract({
        abi: './build/wax.orng.abi',
        wasm: './build/wax.orng.wasm',
      });

      await chain.api.getContract(orngContract.name, true);

      await orngContract.contract.action.setpubkey(
        {
          version: 1,
          exponent: exponent0,
          modulus: modulus0,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      await orngContract.contract.action.migrate2(
        {
          batch_size: 10,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      let reqsTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      let req1 = reqsTable.rows[0];
      expect(req1.assoc_id).toEqual(job1.assoc_id);
      expect(req1.seed).toEqual(sha256(job1.signing_value.toString()));
      expect(req1.dapp).toEqual(job1.caller);
    });
  });
});
