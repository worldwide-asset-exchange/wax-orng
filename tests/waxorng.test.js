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

const crypto = require("crypto");
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

function getActivePermission(actors) {
  const permisisons = []
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
  let systemContract = "eosio";
  let orngContract = "orng.test";
  let orngOracle = "oracle.wax";
  let dappContract = "dapp.wax";
  let pauseAcc = "pause.test";
  let payee = "payee";
  let payer = "payer";
  const exponent0 = "10001";
  const modulus0 = "c61c159689a0bddad3b3855e29f996c91d358f8735d653272565957f9b184f4312b6fe1604adacbcbc9af99a8a9cebfeabd3e93fff3b1e5c7e7a95567e1671dd2b09e868dc54763cd3ecac29d0cb1bcf2a5b4ad39455f273a0d91c4adba1ddf8a79e49f9ca48b6c3f8a2280702317c213548d0ee24c2ec2a0fb8ff31196601cb988316dd0bb7830f8702a216e8369167c0a7a22336232a2291a26f1f2811a2ed81e02da627e07315c89ae376f3a7112b73c8661ab64411c99cdc80b77ce373edfd5e17a44a737e4321db373bcf87091ad02a64a09be58b7ad4d8610b58b018bc6c5136150746f2b7d0a83f2832caaafb2b9f30b5e978fe27974d36d2e9334b0eb7c739bda9e212e413ab8b05f4f42ab2d0447b2b152ae02901a3c755bc44ae494f3ee094643c6cc44f0e5a1d7e4220abb62ee595576e94c27e299fe7cb0568b11d638b7a4a8f332c626d704f3d38bf3ae7c2c9f265bac26611df6a7988b15bc8d743bac8f98d6de8fc68d3b6a46a563ffff4f3b58f90fea9fc96223bcf022083562fa69c810641f8d9d4e6ed9e4cfad24f2424d5cbaef058d8fbbd2b44ce59b5f1f2a5ca89f4c0801da6c816611fc6131e9741471bb49bdec6a78ab0559fa4b324f538ad34a0c1ac74a8fee99a7f73b0564312f3473ccd78354b15211d8d8136c31dd2ab1a566c95bcbf2c6e1c1870cb79562e9a9d5e7cabf96e45f37ac3e9c1";
  const privateKey0 = fs.readFileSync('./tests/resources/test_rsa_4096_priv_0.pem', 'utf8');
  const modulus0Id = stringHashToNum(crypto.createHash("sha256").update(modulus0).digest("hex"));

  const exponent1 = "10001";
  const modulus1 = "b67b5732be0888309dfba35e310eee09641a3f609ec94fdfb45aeaec1231e08268f2a065fffb00aa41eaec560af2bedc0d48cd647b89a8a44b4e0a5fef365640ad379d05112e063467f973c0053657534b1c76cbed8aae705d3453b1581b6badbff41ea2ff5a84e84b06e4293978f7d5389180803f5b27c13290f209c647ee0a8de4184d39f6d4e66a01ffd13ac0740a997b9e05023a51b9c281485685c0cfe3743dbc788cc3aac31c2f35a53414ff236ed2a998aa3617f3bda2f6163aa5254cf60f7d73b4d553b1d2fbd057299a297832cd9e8d2a1786b4260188889e9f7dd713dc1c22c6dda8e001ed76114e41529caa575ff6bc54a79d7ed6f6442b9fe84712ec2bae06560eb3fe40292143f69ae67e72ef7a010d95879df4edfb0ed74a2a7b9aeaade0c02a73a9a27c710dba0020891a9585cae9b6937f82c56c20017107990101a86c71b6c759abc5be23eb790c795e138363c40c29c8ec0fae65ad1de30bd2a5b0bbedc633caf21a8eae0d5afced68fb1a2a1cf5a175d5207ffcfad69de17cb839ab82f6ac1833fbe641eb869be9d9cd5e742bd79b7472eed3d39956c4b5eb9578cf92ba9202ddab1b0f81dc05c85380fb85a67adc88ae295de66cdc2977c2f6273acd65f234684cb9b5e60ab75cb6f433eb12961afe295247d7819d5ba4213d4902039234506f5109534734e65c28e2a8078afc3b59b92e7f329f791b";
  const privateKey1 = fs.readFileSync('./tests/resources//test_rsa_4096_priv_1.pem', 'utf8');
  const modulus1Id = stringHashToNum(crypto.createHash("sha256").update(modulus1).digest("hex"));
  beforeAll(async () => {
    jest.setTimeout(10000);

    await setupTestChain();

    await createAccount(orngContract, 500000);
    await createAccount(orngOracle, 500000);
    await createAccount(dappContract, 500000);
    await createAccount(pauseAcc, 500000);
    await createAccount(payee, 500000);
    await createAccount(payer, 500000);

    await setContract(
      orngContract,
      'build/wax.orng.wasm',
      'build/wax.orng.abi'
    );

    await setContract(
      dappContract,
      'build/randreceiver.wasm',
      'build/randreceiver.abi'
    );
    await updateAuth(orngContract, `active`, `owner`, {
      threshold: 1,
      accounts: [
        {
          permission: {
            actor: orngContract,
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

    await updateAuth(orngOracle, `active`, `owner`, {
      threshold: 1,
      accounts: [
        {
          permission: {
            actor: orngContract,
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

    await updateAuth(orngContract, `active`, `owner`, {
      threshold: 1,
      accounts: [
        {
          permission: {
            actor: orngContract,
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

    await genericAction(
      orngContract,
      "setsigpubkey",
      {
        id: 0,
        exponent: exponent0,
        modulus: modulus0
      },
      [{
        actor: orngOracle,
        permission: "active"
      }]
    );

    // create pause permisison
    let auth = { threshold: 1, accounts: [{ permission: { actor: orngContract, permission: "active" }, weight: 1 }], keys: [{ key: TESTING_PUBLIC_KEY, weight: 1 },], waits: [] };
    await genericAction(
      systemContract,
      "updateauth",
      {
        account: orngContract,
        permission: "pause",
        parent: "active",
        auth: auth
      },
      getActivePermission([orngContract])
    );

    await genericAction(
      systemContract,
      "linkauth",
      {
        account: orngContract,
        code: orngContract,
        type: "pause",
        requirement: "pause"
      },
      getActivePermission([orngContract])
    );
  });

  describe("Initialize", () => {
    it("should init first signing key", async () => {
      const sigpubkey_tbl = await getTableRows(
        orngContract,
        "sigpubkey.b",
        orngContract
      );
      expect(sigpubkey_tbl[sigpubkey_tbl.length - 1].id).toEqual(0);
      expect(sigpubkey_tbl[sigpubkey_tbl.length - 1].pubkey_hash_id).toEqual(modulus0Id);
      expect(sigpubkey_tbl[sigpubkey_tbl.length - 1].exponent).toEqual(exponent0);
      expect(sigpubkey_tbl[sigpubkey_tbl.length - 1].modulus).toEqual(modulus0);
    });
  });

  describe("request rand tests", () => {
    it("should accept random value", async () => {
      await genericAction(
        orngContract,
        "requestrand",
        {
          assoc_id: 0,
          signing_value: 1,
          caller: dappContract
        },
        [{
          actor: dappContract,
          permission: "active"
        }]
      );

      const signvals_tbl = await getTableRows(
        orngContract,
        "signvals.a",
        modulus0Id
      );

      expect(signvals_tbl[signvals_tbl.length - 1].signing_value).toEqual(1);

      const jobs_tbl = await getTableRows(
        orngContract,
        "jobs.a",
        orngContract
      );

      expect(jobs_tbl[jobs_tbl.length - 1].assoc_id).toEqual(0);
      expect(jobs_tbl[jobs_tbl.length - 1].signing_value).toEqual(1);
      expect(jobs_tbl[jobs_tbl.length - 1].caller).toEqual(dappContract);
    });

    it("should throw if use the used random value", async () => {
      await genericAction(
        orngContract,
        "requestrand",
        {
          assoc_id: 0,
          signing_value: 2,
          caller: dappContract
        },
        [{
          actor: dappContract,
          permission: "active"
        }]
      );

      await expect(
        genericAction(
          orngContract,
          "requestrand",
          {
            assoc_id: 0,
            signing_value: 2,
            caller: dappContract
          },
          [{
            actor: dappContract,
            permission: "active"
          }]
        )
      ).rejects.toThrowError("Signing value already used");
    });
  });

  describe("pause tests", () => {
    it("should throw if the contact is paused", async () => {
      await genericAction(
        orngContract,
        "pause",
        {
          paused: true,
        },
        [{
          actor: orngContract,
          permission: "pause"
        }]
      );
      await expect(
        genericAction(
          orngContract,
          "requestrand",
          {
            assoc_id: 0,
            signing_value: 3,
            caller: dappContract
          },
          [{
            actor: dappContract,
            permission: "active"
          }]
        )
      ).rejects.toThrowError("Contract is paused");

      await genericAction(
        orngContract,
        "pause",
        {
          paused: false,
        },
        [{
          actor: orngContract,
          permission: "pause"
        }]
      );
      await genericAction(
        orngContract,
        "requestrand",
        {
          assoc_id: 0,
          signing_value: 4,
          caller: dappContract
        },
        [{
          actor: dappContract,
          permission: "active"
        }]
      );
    });
  });

  describe("set rand tests", () => {
    it("should accept random value", async () => {
      jest.setTimeout(10000);
      const rsaSigning = new RSASigning(privateKey0);
      const signing_value = 5;
      const assoc_id = 5;
      await genericAction(
        orngContract,
        "requestrand",
        {
          assoc_id,
          signing_value,
          caller: dappContract
        },
        [{
          actor: dappContract,
          permission: "active"
        }]
      );

      const jobs_tbl = await getTableRows(
        orngContract,
        "jobs.a",
        orngContract
      );
      const signed_value = rsaSigning.generateRandomNumber(jobs_tbl[jobs_tbl.length - 1].signing_value)
      await genericAction(
        orngContract,
        "setrand",
        {
          job_id: jobs_tbl[jobs_tbl.length - 1].id,
          random_value: signed_value,
        },
        [{
          actor: orngOracle,
          permission: "active"
        }]
      );

      const results_tbl = await getTableRows(
        dappContract,
        "results",
        dappContract
      );
      signed_value_hash = crypto.createHash("sha256").update(signed_value).digest("hex")
      expect(results_tbl[results_tbl.length - 1].assoc_id).toEqual(assoc_id);
      expect(results_tbl[results_tbl.length - 1].random_value).toEqual(signed_value_hash);
    });

    it("should throw if invalid signed value", async () => {
      jest.setTimeout(10000);
      const rsaSigning = new RSASigning(privateKey0);
      const signing_value = 6;
      const assoc_id = 6;
      await genericAction(
        orngContract,
        "requestrand",
        {
          assoc_id,
          signing_value,
          caller: dappContract
        },
        [{
          actor: dappContract,
          permission: "active"
        }]
      );

      const jobs_tbl = await getTableRows(
        orngContract,
        "jobs.a",
        orngContract
      );

      await expect(
        genericAction(
          orngContract,
          "setrand",
          {
            job_id: jobs_tbl[jobs_tbl.length - 1].id,
            random_value: 'faked_signed_value',
          },
          [{
            actor: orngOracle,
            permission: "active"
          }]
        )
      ).rejects.toThrowError("Could not verify signature.");

      const signed_value = rsaSigning.generateRandomNumber(1234)
      await expect(
        genericAction(
          orngContract,
          "setrand",
          {
            job_id: jobs_tbl[jobs_tbl.length - 1].id,
            random_value: signed_value,
          },
          [{
            actor: orngOracle,
            permission: "active"
          }]
        )
      ).rejects.toThrowError("Could not verify signature.");
    });
  });

  describe("switch publickey tests", () => {

    it("should switch to the next publickey", async () => {
      await genericAction(
        orngContract,
        "requestrand",
        {
          assoc_id: 8,
          signing_value: 8,
          caller: dappContract
        },
        [{
          actor: dappContract,
          permission: "active"
        }]
      );
      await genericAction(
        orngContract,
        "setchance",
        {
          chance_to_switch: 1,
        },
        [{
          actor: orngOracle,
          permission: "active"
        }]
      );

      let pubconfig_tbl = await getTableRows(
        orngContract,
        "pubconfig.a",
        orngContract
      );

      expect(pubconfig_tbl[pubconfig_tbl.length - 1].chance_to_switch).toEqual(1);
      expect(pubconfig_tbl[pubconfig_tbl.length - 1].active_key_index).toEqual(0);
      expect(pubconfig_tbl[pubconfig_tbl.length - 1].available_key_counter).toEqual(1);

      await genericAction(
        orngContract,
        "setsigpubkey",
        {
          id: 1,
          exponent: exponent1,
          modulus: modulus1
        },
        [{
          actor: orngOracle,
          permission: "active"
        }]
      );

      const signing_value = 9;
      const assoc_id = 9;
      await genericAction(
        orngContract,
        "requestrand",
        {
          assoc_id,
          signing_value,
          caller: dappContract
        },
        [{
          actor: dappContract,
          permission: "active"
        }]
      );

      pubconfig_tbl = await getTableRows(
        orngContract,
        "pubconfig.a",
        orngContract
      );

      expect(pubconfig_tbl[pubconfig_tbl.length - 1].chance_to_switch).toEqual(1);
      expect(pubconfig_tbl[pubconfig_tbl.length - 1].active_key_index).toEqual(1);
      expect(pubconfig_tbl[pubconfig_tbl.length - 1].available_key_counter).toEqual(2);

      const jobs_tbl = await getTableRows(
        orngContract,
        "jobs.a",
        orngContract
      );
      const rsaSigning = new RSASigning(privateKey1);
      const signed_value = rsaSigning.generateRandomNumber(jobs_tbl[jobs_tbl.length - 1].signing_value)
      await genericAction(
        orngContract,
        "setrand",
        {
          job_id: jobs_tbl[jobs_tbl.length - 1].id,
          random_value: signed_value,
        },
        [{
          actor: orngOracle,
          permission: "active"
        }]
      );

      await genericAction(
        orngContract,
        "setchance",
        {
          chance_to_switch: 1000000,
        },
        [{
          actor: orngOracle,
          permission: "active"
        }]
      );
    });
  });

  describe("set publickey tests", () => {

    it("should throw if it jump the next indexes key", async () => {
      const pubconfig_tbl = await getTableRows(
        orngContract,
        "pubconfig.a",
        orngContract
      );

      await expect(
        genericAction(
          orngContract,
          "setsigpubkey",
          {
            id: pubconfig_tbl[pubconfig_tbl.length - 1].available_key_counter + 100,
            exponent: "exponent2",
            modulus: "modulus2"
          },
          [{
            actor: orngOracle,
            permission: "active"
          }]
        )
      ).rejects.toThrowError("make sure the next key in order");
    });

    it("should set next publickey", async () => {
      const pubconfig_tbl = await getTableRows(
        orngContract,
        "pubconfig.a",
        orngContract
      );
      await genericAction(
        orngContract,
        "setsigpubkey",
        {
          id: pubconfig_tbl[pubconfig_tbl.length - 1].available_key_counter,
          exponent: "exponent2",
          modulus: "modulus2"
        },
        [{
          actor: orngOracle,
          permission: "active"
        }]
      );

      const sigpubkey_tbl = await getTableRows(
        orngContract,
        "sigpubkey.b",
        orngContract
      );

      expect(sigpubkey_tbl[sigpubkey_tbl.length - 1].id).toEqual(pubconfig_tbl[pubconfig_tbl.length - 1].available_key_counter);
      expect(sigpubkey_tbl[sigpubkey_tbl.length - 1].exponent).toEqual("exponent2");
      expect(sigpubkey_tbl[sigpubkey_tbl.length - 1].modulus).toEqual("modulus2");
    });
  });

  describe("set bwpayer tests", () => {
    it("should setpayer", async () => {
      await genericAction(
        orngContract,
        "setbwpayer",
        {
          payee: payee,
          payer: payer
        },
        [{
          actor: payee,
          permission: "active"
        }]
      );

      const bwpayers_tbl = await getTableRows(
        orngContract,
        "bwpayers.a",
        orngContract
      );

      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payee).toEqual(payee);
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payer).toEqual(payer);
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].accepted).toEqual(0);

    });

    it("should throw if no payer not exist", async () => {
      await expect(
        genericAction(
          orngContract,
          "setbwpayer",
          {
            payee: payee,
            payer: 'fakepayer'
          },
          [{
            actor: payee,
            permission: "active"
          }]
        )
      ).rejects.toThrowError("payer account does not exist");
    });

    it("should throw if set payer again", async () => {
      await expect(
        genericAction(
          orngContract,
          "setbwpayer",
          {
            payee: payee,
            payer: payer
          },
          [{
            actor: payee,
            permission: "active"
          }]
        )
      ).rejects.toThrowError("payer for this contract has already set with that account");
    });

    it("change payer", async () => {
      await genericAction(
        orngContract,
        "setbwpayer",
        {
          payee: payee,
          payer: 'eosio'
        },
        [{
          actor: payee,
          permission: "active"
        }]
      );

      const bwpayers_tbl = await getTableRows(
        orngContract,
        "bwpayers.a",
        orngContract
      );

      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payee).toEqual(payee);
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payer).toEqual('eosio');
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].accepted).toEqual(0);
    });
  });

  describe("accept bwpay tests", () => {
    it("should setpayer", async () => {
      const payer1 = 'payer1'
      const payee1 = 'payee1'
      await createAccount(payer1, 500000);
      await createAccount(payee1, 500000);

      await genericAction(
        orngContract,
        "setbwpayer",
        {
          payee: payee1,
          payer: payer1
        },
        [{
          actor: payee1,
          permission: "active"
        }]
      );

      await genericAction(
        orngContract,
        "acceptbwpay",
        {
          payee: payee1,
          payer: payer1,
          accepted: true
        },
        [{
          actor: payer1,
          permission: "active"
        }]
      );

      let bwpayers_tbl = await getTableRows(
        orngContract,
        "bwpayers.a",
        orngContract
      );

      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payee).toEqual(payee1);
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payer).toEqual(payer1);
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].accepted).toEqual(1);

      await genericAction(
        orngContract,
        "acceptbwpay",
        {
          payee: payee1,
          payer: payer1,
          accepted: false
        },
        [{
          actor: payer1,
          permission: "active"
        }]
      );

      bwpayers_tbl = await getTableRows(
        orngContract,
        "bwpayers.a",
        orngContract
      );

      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payee).toEqual(payee1);
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].payer).toEqual(payer1);
      expect(bwpayers_tbl[bwpayers_tbl.length - 1].accepted).toEqual(0);
    });
  });
});