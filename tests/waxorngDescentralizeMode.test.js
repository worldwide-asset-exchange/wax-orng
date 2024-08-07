const { Chain, Account } = require('qtest-js');

const crypto = require('crypto');
const fs = require('fs');
const { RSASigning } = require('./rsaSigning.js');
const { stringHashToNum, getRandomInt, findResolerOfEpoch, sleep } = require('./utils.js');

const ORACLE_MODE = 0;
const DECENTRALIZE_MODE = 1;

async function nodesPing(orngContract, nodes) {
  for (let node of nodes) {
    await orngContract.contract.action.nodeping(
      {
        owner: node.name,
        seed: crypto.randomBytes(32).toString('hex'),
      },
      [
        {
          actor: node.name,
          permission: 'active',
        },
      ]
    );
  }
}

describe('test orng smart contract', () => {
  let chain;
  let orngContract = 'orng.test';
  let orngOracle = 'oracle.wax';
  let orngV1Oracle = 'oraclev1.wax';
  let dappContract = 'dapp.wax';
  let tokenContract = 'token1111111';
  let pauseAcc = 'pause.test';
  let payee = 'payee';
  let payer = 'payer';
  let node1 = 'node1';
  let node2 = 'node2';
  let node3 = 'node3';
  let node4 = 'node4';
  let node5 = 'node5';
  let epochDuration;
  let resolvers;

  let signingKey = [];
  for (let i = 0; i < 5; i++) {
    const signingPrivateKey = fs.readFileSync(`./tests/resources/test_rsa_4096_priv_${i}.pem`, 'utf8');
    const rsaSigning = new RSASigning(signingPrivateKey);
    signingKey.push(
      {
        exponent: rsaSigning.key.keyPair.e.toString(16),
        modulus: rsaSigning.key.keyPair.n.toString(16),
        privateKey: signingPrivateKey,
        modulusId: stringHashToNum(crypto.createHash('sha256').update(rsaSigning.key.keyPair.e.toString(16)).digest('hex'))
      }
    )
  }

  beforeAll(async () => {
    jest.setTimeout(20000);

    chain = await Chain.setupChain('WAX');

    [orngOracle, orngV1Oracle, dappContract, tokenContract, pauseAcc, payee, payer, node1, node2, node3, node4, node5] =
      await chain.system.createAccounts(
        [orngOracle, orngV1Oracle, dappContract, tokenContract, pauseAcc, payee, payer, node1, node2, node3, node4, node5],
        '200000.00000000 WAX'
      );

    orngContract = await chain.system.createAccount(orngContract, '10000.00000000 WAX', 2000000);

    await orngContract.setContract({
      abi: './build/wax.orng.abi',
      wasm: './build/wax.orng.wasm',
    });
    await orngContract.addCode('active');

    await dappContract.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });

    await tokenContract.setContract({
      wasm: './tests/contracts/eosio.token.wasm',
      abi: './tests/contracts/eosio.token.abi',
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
        exponent: signingKey[0].exponent,
        modulus: signingKey[0].modulus,
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

    await orngContract.contract.action.setconfig(
      {
        config: 'runningmode',
        value: DECENTRALIZE_MODE,
      },
      [
        {
          actor: orngContract.name,
          permission: 'active',
        },
      ]
    );

    // await tokenContract.updateAuth(
    //   'pause',
    //   'active',
    //   auth.threshold,
    //   auth.keys,
    //   auth.accounts,
    //   auth.waits
    // );

    await tokenContract.contract.action.create(
      {
        issuer: tokenContract.name,
        maximum_supply: '1000000000000.0000 BRWL',
      },
      [{ actor: tokenContract.name, permission: 'active' }]
    );

    await tokenContract.contract.action.issue(
      {
        to: tokenContract.name,
        quantity: '1000000.0000 BRWL',
        memo: 'issue',
      },
      [{ actor: tokenContract.name, permission: 'active' }]
    );

    tokenContract.contract.action.transfer(
      {
        from: tokenContract.name,
        to: node1.name,
        quantity: '123000.0000 BRWL',
        memo: 'issue',
      },
      [{ actor: tokenContract.name, permission: 'active' }]
    )

    const config_tbl = await orngContract.contract.table['config.a'].get({
      scope: orngContract.name,
      lower_bound: 'epocduration',
      upper_bound: 'epocduration',
    });

    epochDuration = +config_tbl.rows[0]?.value || 60;
  });

  afterAll(async () => {
    await chain.clear();
  }, 10000);

  describe('noderegister tests', () => {
    it('should throw if missing owner permission', async () => {
      await expect(
        orngContract.contract.action.noderegister(
          {
            owner: node1.name,
            exponent: 'exponent2',
            modulus: 'modulus2',
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('missing authority of ' + node1.name);
    });

    it('should register node', async () => {
      await orngContract.contract.action.noderegister(
        {
          owner: node1.name,
          exponent: signingKey[0].exponent,
          modulus: signingKey[0].modulus,
        },
        [
          {
            actor: node1.name,
            permission: 'active',
          },
        ]
      );

      const node_tbl = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: node1.name,
        upper_bound: node1.name
      });

      expect(node_tbl.rows.length).toBe(1);
      expect(node_tbl.rows[0].owner).toBe(node1.name);
      expect(node_tbl.rows[0].exponent).toBe(signingKey[0].exponent);
      expect(node_tbl.rows[0].modulus).toBe(signingKey[0].modulus);
      expect(node_tbl.rows[0].staked).toBe(0);
    });

    it('should throw if already registered', async () => {
      await expect(
        orngContract.contract.action.noderegister(
          {
            owner: node1.name,
            exponent: 'exponent2',
            modulus: 'modulus2',
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Node already registered');
    });
  });

  describe('node stake tests', () => {
    it.skip('should throw if invalid token contract', async () => {
      await expect(
        tokenContract.contract.action.transfer(
          {
            from: node1.name,
            to: orngContract.name,
            quantity: '123.0000 BRWL',
            memo: 'issue',
          },
          [{ actor: node1.name, permission: 'active' }]
        )
      ).rejects.toThrowError("Invalid token contract");
    });

    it('should throw if wrong memo', async () => {
      await expect(
        node2.transfer(orngContract.name, '123.00000000 WAX', 'test fail')
      ).rejects.toThrowError("Only stake token are allow");
    });

    it('should throw if node has not registered', async () => {
      await expect(
        node2.transfer(orngContract.name, '123.00000000 WAX', 'stake')
      ).rejects.toThrowError("Resolver not found, please register first");
    });

    it('should throw if not enough wax transfer', async () => {
      await expect(
        node1.transfer(orngContract.name, '99999.99999999 WAX', 'stake')
      ).rejects.toThrowError("Not enough WAX transfered. Required: ");
    });

    it('should stake for node', async () => {
      await node1.transfer(orngContract.name, '100000.00000000 WAX', 'stake');

      const node_tbl = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: node1.name,
        upper_bound: node1.name
      });

      expect(node_tbl.rows.length).toBe(1);
      expect(node_tbl.rows[0].staked).toBe('10000000000000');
      expect(node_tbl.rows[0].owner).toBe(node1.name);
    });
  });

  describe('resolverping tests', () => {
    it('should throw if missing owner permission', async () => {
      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node1.name,
            seed: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('missing authority of ' + node1.name);
    });

    it('should throw if RNG is not running decentralize mode', async () => {
      await orngContract.contract.action.setconfig(
        {
          config: 'runningmode',
          value: ORACLE_MODE,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node1.name,
            seed: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('RNG is not running decentralize mode');

      await orngContract.contract.action.setconfig(
        {
          config: 'runningmode',
          value: DECENTRALIZE_MODE,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
    });

    it('should throw if node has not registered', async () => {
      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node2.name,
            seed: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Node not found, please register first');
    });

    it('should throw if node has not staked', async () => {
      await orngContract.contract.action.noderegister(
        {
          owner: node2.name,
          exponent: signingKey[1].exponent,
          modulus: signingKey[1].modulus,
        },
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node2.name,
            seed: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Please stake for node');
    });

    it('should node ping and create next epoch record', async () => {
      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(0);

      const txResult = await orngContract.contract.action.nodeping(
        {
          owner: node1.name,
          seed: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
        },
        [
          {
            actor: node1.name,
            permission: 'active',
          },
        ]
      );

      epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].id).toBe(1);

      const txEpochTime = Math.floor(new Date(txResult.processed.block_time).getTime()/1000);
      expect(epoch_tbl.rows[0].end_time).toBe(txEpochTime + 2*epochDuration);
      expect(epoch_tbl.rows[0].seeds.length).toBe(1);
      expect(epoch_tbl.rows[0].seeds[0]).toBe('cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133');
      expect(epoch_tbl.rows[0].active_nodes.length).toBe(1);
      expect(epoch_tbl.rows[0].active_nodes[0]).toBe(node1.name);
      expect(epoch_tbl.rows[0].resolvers.length).toBe(0);
    });

    it('should another node ping for next epoch', async () => {
      await node2.transfer(orngContract.name, '100000.00000000 WAX', 'stake');

      await orngContract.contract.action.nodeping(
        {
          owner: node2.name,
          seed: 'f701ef06ecae622236044b2d116c82e5ac63a1537d624ad09616411796eb4469',
        },
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].id).toBe(1);

      expect(epoch_tbl.rows[0].seeds.length).toBe(2);
      expect(epoch_tbl.rows[0].seeds[1]).toBe('f701ef06ecae622236044b2d116c82e5ac63a1537d624ad09616411796eb4469');
      expect(epoch_tbl.rows[0].active_nodes.length).toBe(2);
      expect(epoch_tbl.rows[0].active_nodes[1]).toBe(node2.name);
      expect(epoch_tbl.rows[0].resolvers.length).toBe(0);
    });

    it('should throw if already submit seed for next epoch', async () => {
      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node2.name,
            seed: 'f701ef06ecae622236044b2d116c82e5ac63a1537d624ad09616411796eb4469',
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('already submit seed for next epoch');
    });
  });

  describe('resolveepoch tests', () => {
    it('should throw if first epoch has not initialized', async () => {
      await expect(
        orngContract.contract.action.resolveepoch(
          {},
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('epoch is initalizing');
    });

    it('should skip epoch if number of active node is not satisfy minimum', async () => {
      await chain.time.increase(epochDuration + 1);
      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );
      const config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      expect(config_tbl.rows.length).toBe(1);
      expect(config_tbl.rows[0].value).toBe(1);

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl.rows[0].active_nodes.length).toBe(2);
    });

    it('should resolve epoch and assign random resolvers', async () => {
      await nodesPing(orngContract, [ node1, node2]);

      await orngContract.contract.action.noderegister(
        {
          owner: node3.name,
          exponent: signingKey[2].exponent,
          modulus: signingKey[2].modulus,
        },
        [
          {
            actor: node3.name,
            permission: 'active',
          },
        ]
      );
      await node3.transfer(orngContract.name, '100000.00000000 WAX', 'stake');

      await orngContract.contract.action.nodeping(
        {
          owner: node3.name,
          seed: crypto.randomBytes(32).toString('hex'),
        },
        [
          {
            actor: node3.name,
            permission: 'active',
          },
        ]
      );

      const config_tbl_before = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      const epoch_tbl_before = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_before.rows.length).toBe(2);
      expect(epoch_tbl_before.rows[1].resolvers.length).toBe(0);
      expect(epoch_tbl_before.rows[1].active_nodes.length).toBe(3);

      expect(config_tbl_before.rows.length).toBe(1);
      expect(config_tbl_before.rows[0].value).toBe(1);

      await chain.time.increase(epochDuration);

      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );
      const config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      expect(config_tbl.rows.length).toBe(1);
      expect(config_tbl.rows[0].value).toBe(2);

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(2);
      expect(epoch_tbl.rows[1].resolvers.length).toBe(1);
      expect(epoch_tbl.rows[1].active_nodes.length).toBe(3);

      resolvers = findResolerOfEpoch(epoch_tbl.rows[1], 1);

      expect(epoch_tbl.rows[1].resolvers[0]).toBe(resolvers[0]);
    });
  });

  describe('setranddecen tests', () => {
    it('should throw if missing resolver pemission', async () => {
      await expect(
        orngContract.contract.action.setranddecen(
          {
            resolver: node1.name,
            job_id: 0,
            random_value: "7e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d277e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d27",
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('missing authority of ' + node1.name);
    });

    it('should throw if contract is paused', async () => {
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
        orngContract.contract.action.setranddecen(
          {
            resolver: node1.name,
            job_id: 0,
            random_value: "7e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d277e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d27",
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Contract is paused');

      await await orngContract.contract.action.pause(
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

    it('should throw if RNG is not running decentralize mode', async () => {
      await orngContract.contract.action.setconfig(
        {
          config: 'runningmode',
          value: ORACLE_MODE,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      await expect(
        orngContract.contract.action.setranddecen(
          {
            resolver: node1.name,
            job_id: 0,
            random_value: "7e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d277e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d27",
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('RNG is not running decentralize mode');

      await orngContract.contract.action.setconfig(
        {
          config: 'runningmode',
          value: DECENTRALIZE_MODE,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
    });

    it('should throw if node has not resgistered', async () => {
      await expect(
        orngContract.contract.action.setranddecen(
          {
            resolver: orngContract.name,
            job_id: 0,
            random_value: "7e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d277e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d27",
          },
          [
            {
              actor: orngContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Resolver not found, please register first');
    });

    it('should throw if job not found', async () => {
      await expect(
        orngContract.contract.action.setranddecen(
          {
            resolver: node1.name,
            job_id: 0,
            random_value: "7e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d277e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d27",
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Could not find job id.');
    });

    it('should throw if node is not a valid resolver', async () => {
      await orngContract.contract.action.noderegister(
        {
          owner: node4.name,
          exponent: signingKey[3].exponent,
          modulus: signingKey[3].modulus,
        },
        [
          {
            actor: node4.name,
            permission: 'active',
          },
        ]
      );
      await node4.transfer(orngContract.name, '100000.00000000 WAX', 'stake');

      await orngContract.contract.action.requestrand(
        {
          assoc_id: 0,
          signing_value: 111,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      await expect(
        orngContract.contract.action.setranddecen(
          {
            resolver: node4.name,
            job_id: 0,
            random_value: "7e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d277e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d27",
          },
          [
            {
              actor: node4.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Node is not a valid resolver for this epoch');
    });

    it('should throw if invalid signature', async () => {
      await expect(
        orngContract.contract.action.setranddecen(
          {
            resolver: resolvers[0],
            job_id: 0,
            random_value: "7e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d277e124be9cf7d8a57a7256733684398af66e14aa3688d78988e45da30c7aa7d27",
          },
          [
            {
              actor: resolvers[0],
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Could not verify signature.');
    });

    it('should single resolver set rand', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_before.rows.length).toBe(1);

      const nodeIndex = +(resolvers[0].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[0].signing_value
      );

      await orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[0],
          job_id: jobs_tbl_before.rows[0].id,
          random_value: signedValue,
        },
        [
          {
            actor: resolvers[0],
            permission: 'active',
          },
        ]
      );

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_after.rows.length).toBe(0);

      const node_tbl = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[0],
        upper_bound: resolvers[0],
      });

      expect(node_tbl.rows.length).toBe(1);
      expect(node_tbl.rows[0].owner).toBe(resolvers[0]);
      expect(node_tbl.rows[0].job_count).toBe(1);
    });
  });

  describe('epoch with 3 resolvers', () => {
    beforeAll(async () => {
      await orngContract.contract.action.setconfig(
        {
          config: 'numresolver',
          value: 3,
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      await orngContract.contract.action.noderegister(
        {
          owner: node5.name,
          exponent: signingKey[4].exponent,
          modulus: signingKey[4].modulus,
        },
        [
          {
            actor: node5.name,
            permission: 'active',
          },
        ]
      );

      await node5.transfer(orngContract.name, '100000.00000000 WAX', 'stake');
    });

    it('should 5 node ping and pick 3 resolvers for next epoch', async () => {
      let config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      const currentEpochId = +config_tbl.rows[0].value;

      await nodesPing(orngContract, [node1, node2, node3, node4, node5]);

      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      let nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];
      expect(nextEpoch.id).toBe(currentEpochId + 1);
      expect(nextEpoch.seeds.length).toBe(5);
      expect(nextEpoch.active_nodes.length).toBe(5);
      expect(nextEpoch.active_nodes[0]).toBe(node1.name);
      expect(nextEpoch.resolvers.length).toBe(0);
    });

    it('should hash and pick 3 resolvers for next epoch', async () => {
      let config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      const currentEpochId = +config_tbl.rows[0].value;

      await chain.time.increase(epochDuration + 1);

      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );
      config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      expect(config_tbl.rows.length).toBe(1);
      expect(config_tbl.rows[0].value).toBe(currentEpochId + 1);

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];
      expect(nextEpoch.resolvers.length).toBe(3);

      resolvers = findResolerOfEpoch(nextEpoch, 3);

      expect(nextEpoch.resolvers.length).toBe(3);
      expect(nextEpoch.resolvers[0]).toBe(resolvers[0]);
      expect(nextEpoch.resolvers[1]).toBe(resolvers[1]);
      expect(nextEpoch.resolvers[2]).toBe(resolvers[2]);
    });

    it('2 resolver submit seed for epoch', async () => {
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 0,
          signing_value: 111112,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_before.rows.length).toBe(1);

      for (let i = 0; i < 2; i++) {
        const nodeIndex = +(resolvers[i].replace('node', '')) - 1;
        const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

        const signedValue = rsaSigning.generateRandomNumber(
          jobs_tbl_before.rows[0].signing_value
        );
        await orngContract.contract.action.setranddecen(
          {
            resolver: resolvers[i],
            job_id: jobs_tbl_before.rows[0].id,
            random_value: signedValue,
          },
          [
            {
              actor: resolvers[i],
              permission: 'active',
            },
          ]
        );
        const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
          scope: orngContract.name,
        });

        expect(jobs_tbl_after.rows.length).toBe(1);
        expect(jobs_tbl_after.rows[0].seeds.length).toBe(i + 1);
        expect(jobs_tbl_after.rows[0].seeds[i]).toBe(crypto.createHash('sha256').update(signedValue).digest('hex'));
        expect(jobs_tbl_after.rows[0].resolvers.length).toBe(i + 1);
        expect(jobs_tbl_after.rows[0].resolvers[i]).toBe(resolvers[i]);
      }
    });

    it('throw if already submit seed for job', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      const nodeIndex = +(resolvers[0].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[0].signing_value
      );
      await expect(orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[0],
          job_id: jobs_tbl_before.rows[0].id,
          random_value: signedValue,
        },
        [
          {
            actor: resolvers[0],
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('Already submit seed for this job');
    });

    it('third resolver submit seed and fulfil job', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      const nodeIndex = +(resolvers[2].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[0].signing_value
      );

      let node_tbl_before = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[0],
        upper_bound: resolvers[0]
      });
      const jobCountResolver0 = node_tbl_before.rows[0].job_count;

      node_tbl_before = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[1],
        upper_bound: resolvers[1]
      });
      const jobCountResolver1 = node_tbl_before.rows[0].job_count;

      node_tbl_before = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[2],
        upper_bound: resolvers[2]
      });
      const jobCountResolver2 = node_tbl_before.rows[0].job_count;

      await orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[2],
          job_id: jobs_tbl_before.rows[0].id,
          random_value: signedValue,
        },
        [
          {
            actor: resolvers[2],
            permission: 'active',
          },
        ]
      );

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_after.rows.length).toBe(0);

      let node_tbl_after = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[0],
        upper_bound: resolvers[0]
      });
      expect(node_tbl_after.rows[0].job_count).toBe(jobCountResolver0 + 1);

      node_tbl_after = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[1],
        upper_bound: resolvers[1]
      });
      expect(node_tbl_after.rows[0].job_count).toBe(jobCountResolver1 + 1);

      node_tbl_after = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[2],
        upper_bound: resolvers[2]
      });
      expect(node_tbl_after.rows[0].job_count).toBe(jobCountResolver2 + 1);
    });

    it('resolvers submit seed for another job', async () => {
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 0,
          signing_value: 111114,
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
          assoc_id: 0,
          signing_value: 111115,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_before.rows.length).toBe(2);

      for (let i = 1; i <= 2; i++) {
        const nodeIndex = +(resolvers[i].replace('node', '')) - 1;
        const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

        const signedValue = rsaSigning.generateRandomNumber(
          jobs_tbl_before.rows[0].signing_value
        );

        await orngContract.contract.action.setranddecen(
          {
            resolver: resolvers[i],
            job_id: jobs_tbl_before.rows[0].id,
            random_value: signedValue,
          },
          [
            {
              actor: resolvers[i],
              permission: 'active',
            },
          ]
        );
      }

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_after.rows.length).toBe(2);
      expect(jobs_tbl_after.rows[0].seeds.length).toBe(2);
      expect(jobs_tbl_after.rows[0].resolvers.length).toBe(2);
      expect(jobs_tbl_after.rows[0].resolvers[0]).toBe(resolvers[1]);
      let config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      const currentEpochId = +config_tbl.rows[0].value;

      expect(jobs_tbl_after.rows[0].last_resolve_epoch).toBe(currentEpochId);
    });

    it('next epoch comming with new set of resolvers and remaining submited seed jobs in previous epoch without completed', async () => {
      let config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      const currentEpochId = +config_tbl.rows[0].value;

      await nodesPing(orngContract, [node3, node5, node1, node4, node2]);

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      let nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];
      expect(nextEpoch.id).toBe(currentEpochId + 1);
      expect(nextEpoch.seeds.length).toBe(5);
      expect(nextEpoch.active_nodes.length).toBe(5);
      expect(nextEpoch.active_nodes[0]).toBe(node3.name);
      expect(nextEpoch.resolvers.length).toBe(0);

      resolvers = findResolerOfEpoch(nextEpoch, 3);

      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_before.rows.length).toBe(2);

      await chain.time.increase(epochDuration + 1);

      const nodeIndex = +(resolvers[2].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[0].signing_value
      );

      const node_tbl_before = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[2],
        upper_bound: resolvers[2]
      });
      const jobCountResolver = node_tbl_before.rows[0].job_count;

      await orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[2],
          job_id: jobs_tbl_before.rows[0].id,
          random_value: signedValue,
        },
        [
          {
            actor: resolvers[2],
            permission: 'active',
          },
        ]
      );

      config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      expect(config_tbl.rows.length).toBe(1);
      expect(config_tbl.rows[0].value).toBe(currentEpochId + 1);

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_after.rows.length).toBe(2);
      expect(jobs_tbl_after.rows[0].seeds.length).toBe(1); // job did not collect enough seeds in previous epoch will be clear and add new seed in this epoch
      expect(jobs_tbl_after.rows[0].seeds[0]).toBe(crypto.createHash('sha256').update(signedValue).digest('hex'));
      expect(jobs_tbl_after.rows[0].resolvers.length).toBe(1);
      expect(jobs_tbl_after.rows[0].resolvers[0]).toBe(resolvers[2]);
      expect(jobs_tbl_after.rows[0].last_resolve_epoch).toBe(currentEpochId + 1);

      const node_tbl_after = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[2],
        upper_bound: resolvers[2]
      });
      expect(node_tbl_after.rows[0].job_count).toBe(jobCountResolver); // job not resolved yet, not count
    });

    it('all resolvers submit seeds and complete job', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_before.rows.length).toBe(2);

      const node_tbl_before = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[2],
        upper_bound: resolvers[2]
      });
      const jobCountResolver = node_tbl_before.rows[0].job_count;

      for (let i = 0; i < 2; i++) {
        const nodeIndex = +(resolvers[i].replace('node', '')) - 1;
        const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

        const signedValue = rsaSigning.generateRandomNumber(
          jobs_tbl_before.rows[0].signing_value
        );

        await orngContract.contract.action.setranddecen(
          {
            resolver: resolvers[i],
            job_id: jobs_tbl_before.rows[0].id,
            random_value: signedValue,
          },
          [
            {
              actor: resolvers[i],
              permission: 'active',
            },
          ]
        );
      }

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
        lower_bound: jobs_tbl_before.rows[0].id,
        upper_bound: jobs_tbl_before.rows[0].id,
      });

      expect(jobs_tbl_after.rows.length).toBe(0);

      const node_tbl_after = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[2],
        upper_bound: resolvers[2]
      });
      expect(node_tbl_after.rows[0].job_count).toBe(jobCountResolver + 1); 
    });
  });

  describe('skip epoch if no active node', () => {
    it('throw if no active node in epoch', async () => {
      await chain.time.increase(epochDuration + 1);

      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_before.rows.length).toBe(1);

      const nodeIndex = +(resolvers[0].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[0].signing_value
      );

      await expect(orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[0],
          job_id: jobs_tbl_before.rows[0].id,
          random_value: signedValue,
        },
        [
          {
            actor: resolvers[0],
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('no available epoch');
    });

    it('node ping after skipped epoch', async () => {
      let config_tbl = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'epochid',
        upper_bound: 'epochid',
      });

      const currentEpochId = +config_tbl.rows[0].value;

      const txResult = await orngContract.contract.action.nodeping(
        {
          owner: node3.name,
          seed: crypto.randomBytes(32).toString('hex'),
        },
        [
          {
            actor: node3.name,
            permission: 'active',
          },
        ]
      );

      await nodesPing(orngContract, [node5, node1, node4, node2]);

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const txEpochTime = Math.floor(new Date(txResult.processed.block_time).getTime()/1000);

      let nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];
      let currentEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 2];
      expect(nextEpoch.id).toBe(currentEpochId + 1);
      expect(nextEpoch.seeds.length).toBe(5);
      expect(nextEpoch.active_nodes.length).toBe(5);
      expect(nextEpoch.active_nodes[0]).toBe(node3.name);
      expect(nextEpoch.resolvers.length).toBe(0);
      expect(nextEpoch.end_time).toBe(currentEpoch.end_time + (Math.floor((txEpochTime - currentEpoch.end_time)/epochDuration) + 2)*epochDuration);
    });

    it('throw if new epoch still inititalizing after skipped epoch', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_before.rows.length).toBe(1);

      const nodeIndex = +(resolvers[0].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[0].signing_value
      );

      await expect(orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[0],
          job_id: jobs_tbl_before.rows[0].id,
          random_value: signedValue,
        },
        [
          {
            actor: resolvers[0],
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('epoch is initalizing');
    });

    it('pick random resolvers when next epoch comming', async () => {
      await chain.time.increase(epochDuration + 1);

      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_before.rows.length).toBe(1);

      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      let nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];

      resolvers = findResolerOfEpoch(nextEpoch, 3);

      const nodeIndex = +(resolvers[0].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[0].signing_value
      );

      await orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[0],
          job_id: jobs_tbl_before.rows[0].id,
          random_value: signedValue,
        },
        [
          {
            actor: resolvers[0],
            permission: 'active',
          },
        ]
      );

      epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];

      expect(nextEpoch.resolvers.length).toBe(3);
      expect(nextEpoch.resolvers[0]).toBe(resolvers[0]);
      expect(nextEpoch.resolvers[1]).toBe(resolvers[1]);
      expect(nextEpoch.resolvers[2]).toBe(resolvers[2]);
    });
  });

  describe('every active node has the same probability to become resolvers', () => {
    it('pick random resolvers', async () => {
      let probability = {
        node1: 0,
        node2: 0,
        node3: 0,
        node4: 0,
        node5: 0,
      }
      for (let i = 0; i < 100; i++) {
        let config_tbl = await orngContract.contract.table['config.a'].get({
          scope: orngContract.name,
          lower_bound: 'epochid',
          upper_bound: 'epochid',
        });

        const currentEpochId = +config_tbl.rows[0].value;

        await nodesPing(orngContract, [node1, node4, node2, node5, node3]);

        await chain.time.increase(epochDuration + 1);

        await orngContract.contract.action.resolveepoch(
          {},
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        );
        config_tbl = await orngContract.contract.table['config.a'].get({
          scope: orngContract.name,
          lower_bound: 'epochid',
          upper_bound: 'epochid',
        });

        expect(config_tbl.rows.length).toBe(1);
        expect(config_tbl.rows[0].value).toBe(currentEpochId + 1);

        const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
          scope: orngContract.name,
          limit: 100,
          lower_bound: currentEpochId,
          upper_bound: currentEpochId + 1,
        });

        let nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];
        expect(nextEpoch.id).toBe(currentEpochId + 1);
        expect(nextEpoch.seeds.length).toBe(5);
        expect(nextEpoch.active_nodes.length).toBe(5);
        expect(nextEpoch.resolvers.length).toBe(3);
        for (let r of nextEpoch.resolvers) {
          probability[r]++;
        }
        console.log('  case: ', i);
        await sleep(100);
      }

      console.log(" probability: ", probability);
    }, 1000000);
  });
});
