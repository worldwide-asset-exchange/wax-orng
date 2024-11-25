const { Chain, Account } = require('qtest-js');

const crypto = require('crypto');
const fs = require('fs');
const { RSASigning } = require('./rsaSigning.js');
const { stringHashToNum, getRandomInt, findResolerOfEpoch, sleep } = require('./utils.js');

const ORACLE_MODE = 0;
const DECENTRALIZE_MODE = 1;

async function nodesPing(orngContract, nodes) {
  for (let node of nodes) {
    console.log('---- node ping ', node.name);
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
  let orngOracle = 'oracle.wax'
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
  let epochDuration = 60;
  let resolvers;

  let signingKey = [];
  for (let i = 0; i < 5; i++) {
    const signingPrivateKey = fs.readFileSync(`./tests/resources/test_rsa_4096_priv_${i}.pem`, 'utf8');
    const rsaSigning = new RSASigning(signingPrivateKey);
    const signingPrivateKey1 = fs.readFileSync(`./tests/resources/test_rsa_4096_priv_${i}1.pem`, 'utf8');
    const rsaSigning1 = new RSASigning(signingPrivateKey1);
    signingKey.push(
      {
        exponent: rsaSigning.key.keyPair.e.toString(16),
        modulus: rsaSigning.key.keyPair.n.toString(16),
        privateKey: signingPrivateKey,
        modulusId: stringHashToNum(crypto.createHash('sha256').update(rsaSigning.key.keyPair.e.toString(16)).digest('hex')),
        exponent1: rsaSigning1.key.keyPair.e.toString(16),
        modulus1: rsaSigning1.key.keyPair.n.toString(16),
        privateKey1: signingPrivateKey1,
        modulusId1: stringHashToNum(crypto.createHash('sha256').update(rsaSigning1.key.keyPair.e.toString(16)).digest('hex'))
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
      {
        chance_to_switch: 1000,
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
  });

  afterAll(async () => {
    await chain.clear();
  }, 10000);

  describe('decenconfig tests', () => {
    it('should throw if missing orng contract permission', async () => {
      await expect(
        orngContract.contract.action.decenconfig(
          {
            epoch_duration: epochDuration,
            number_of_resolver: 1,
            node_min_stake: '10000000000000',
            min_active_node: 3,
            job_fail_threshold: 2
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('missing authority of ' + orngContract.name);
    });

    it('should throw if min_active_node greater than number_of_resolver', async () => {
      await expect(
        orngContract.contract.action.decenconfig(
          {
            epoch_duration: epochDuration,
            number_of_resolver: 5,
            node_min_stake: '10000000000000',
            min_active_node: 3,
            job_fail_threshold: 2
          },
          [
            {
              actor: orngContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('min_active_node must be greater than number_of_resolver');
    });

    it('should throw if number_of_resolver must be less than 32', async () => {
      await expect(
        orngContract.contract.action.decenconfig(
          {
            epoch_duration: epochDuration,
            number_of_resolver: 33,
            node_min_stake: '10000000000000',
            min_active_node: 34,
            job_fail_threshold: 2
          },
          [
            {
              actor: orngContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('number_of_resolver must be less than 32');
    });

    it('should set decentralize config', async () => {
      await orngContract.contract.action.decenconfig(
        {
          epoch_duration: epochDuration,
          number_of_resolver: 3,
          node_min_stake: '10000000000000',
          min_active_node: 5,
          job_fail_threshold: 2
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      expect(decentralize_config_tbl.rows.length).toBe(1);
      expect(decentralize_config_tbl.rows[0].epoch_duration).toBe(epochDuration);
      expect(decentralize_config_tbl.rows[0].number_of_resolver).toBe(3);
      expect(decentralize_config_tbl.rows[0].min_active_node).toBe(5);
      expect(decentralize_config_tbl.rows[0].node_min_stake).toBe('10000000000000');
      expect(decentralize_config_tbl.rows[0].current_epoch_id).toBe(0);
      expect(decentralize_config_tbl.rows[0].total_reward).toBe(0);
      expect(decentralize_config_tbl.rows[0].total_processed_jobs).toBe(0);
    });

    it('should update decentralize config', async () => {
      await orngContract.contract.action.decenconfig(
        {
          epoch_duration: epochDuration,
          number_of_resolver: 1,
          node_min_stake: '10000000000000',
          min_active_node: 3,
          job_fail_threshold: 2
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );

      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      expect(decentralize_config_tbl.rows.length).toBe(1);
      expect(decentralize_config_tbl.rows[0].epoch_duration).toBe(epochDuration);
      expect(decentralize_config_tbl.rows[0].number_of_resolver).toBe(1);
      expect(decentralize_config_tbl.rows[0].min_active_node).toBe(3);
      expect(decentralize_config_tbl.rows[0].node_min_stake).toBe('10000000000000');
      expect(decentralize_config_tbl.rows[0].current_epoch_id).toBe(0);
      expect(decentralize_config_tbl.rows[0].total_reward).toBe(0);
      expect(decentralize_config_tbl.rows[0].total_processed_jobs).toBe(0);
    });
  });

  describe('noderegister tests', () => {
    it('should throw if missing owner permission', async () => {
      await expect(
        orngContract.contract.action.noderegister(
          {
            owner: node1.name,
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
        orngContract.contract.action.noderegister(
          {
            owner: node1.name
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

    it('should register node', async () => {
      await orngContract.contract.action.noderegister(
        {
          owner: node1.name
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
      expect(node_tbl.rows[0].staked).toBe(0);
      expect(node_tbl.rows[0].job_count).toBe(0);
    });

    it('should throw if already registered', async () => {
      await expect(
        orngContract.contract.action.noderegister(
          {
            owner: node1.name
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
        node2.transfer(orngContract.name, '123.00000000 WAX', 'test fail')
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

  describe('node set public key tests', () => {
    it('should throw if missing owner pemission', async () => {
      await expect(
        orngContract.contract.action.setnodpubkey(
          {
            owner: node1.name,
            id: 0,
            exponent: signingKey[0].exponent,
            modulus: signingKey[0].modulus
          },
          [{ actor: node2.name, permission: 'active' }]
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
        orngContract.contract.action.setnodpubkey(
          {
            owner: node1.name,
            id: 0,
            exponent: signingKey[0].exponent,
            modulus: signingKey[0].modulus
          },
          [{ actor: node1.name, permission: 'active' }]
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

    it('should throw if modulus empty', async () => {
      await expect(
        orngContract.contract.action.setnodpubkey(
          {
            owner: node1.name,
            id: 0,
            exponent: signingKey[0].exponent,
            modulus: ''
          },
          [{ actor: node1.name, permission: 'active' }]
        )
      ).rejects.toThrowError('modulus must have non-zero length');
    });

    it('should throw if modulus zero', async () => {
      await expect(
        orngContract.contract.action.setnodpubkey(
          {
            owner: node1.name,
            id: 0,
            exponent: signingKey[0].exponent,
            modulus: '0' + signingKey[0].modulus,
          },
          [{ actor: node1.name, permission: 'active' }]
        )
      ).rejects.toThrowError('modulus must have leading zeroes stripped');
    });

    it('should throw if node not found', async () => {
      await expect(
        orngContract.contract.action.setnodpubkey(
          {
            owner: node4.name,
            id: 0,
            exponent: signingKey[0].exponent,
            modulus: signingKey[0].modulus,
          },
          [{ actor: node4.name, permission: 'active' }]
        )
      ).rejects.toThrowError('Node not found, please register first');
    });

    it('should throw if id not match with current active key index', async () => {
      await expect(
        orngContract.contract.action.setnodpubkey(
          {
            owner: node1.name,
            id: 1,
            exponent: signingKey[0].exponent,
            modulus: signingKey[0].modulus,
          },
          [{ actor: node1.name, permission: 'active' }]
        )
      ).rejects.toThrowError('please set active key first');
    });

    it('should set node public key', async () => {
      await orngContract.contract.action.setnodpubkey(
        {
          owner: node1.name,
          id: 0,
          exponent: signingKey[0].exponent,
          modulus: signingKey[0].modulus,
        },
        [{ actor: node1.name, permission: 'active' }]
      );

      let signpubkey_tbl = await orngContract.contract.table['sigpubkey.b'].get({
        scope: node1.name
      });

      expect(signpubkey_tbl.rows.length).toBe(1);
      expect(signpubkey_tbl.rows[0].exponent).toBe(signingKey[0].exponent);
      expect(signpubkey_tbl.rows[0].modulus).toBe(signingKey[0].modulus);
    });

    it('should throw if next key not match order', async () => {
      await expect(
        orngContract.contract.action.setnodpubkey(
          {
            owner: node1.name,
            id: 2,
            exponent: signingKey[0].exponent,
            modulus: signingKey[0].modulus,
          },
          [{ actor: node1.name, permission: 'active' }]
        )
      ).rejects.toThrowError('make sure the next key in order');
    });

    it('should set second public key', async () => {
      await orngContract.contract.action.setnodpubkey(
        {
          owner: node1.name,
          id: 1,
          exponent: signingKey[0].exponent1,
          modulus: signingKey[0].modulus1,
        },
        [{ actor: node1.name, permission: 'active' }]
      );

      let signpubkey_tbl = await orngContract.contract.table['sigpubkey.b'].get({
        scope: node1.name
      });

      expect(signpubkey_tbl.rows.length).toBe(2);
      expect(signpubkey_tbl.rows[1].exponent).toBe(signingKey[0].exponent1);
      expect(signpubkey_tbl.rows[1].modulus).toBe(signingKey[0].modulus1);
    });

    it('should throw if public key already exist', async () => {
      await expect(
        orngContract.contract.action.setnodpubkey(
          {
            owner: node1.name,
            id: 2,
            exponent: signingKey[0].exponent,
            modulus: signingKey[0].modulus,
          },
          [{ actor: node1.name, permission: 'active' }]
        )
      ).rejects.toThrowError('public key already exist');
    });
  });;

  describe('nodeping tests', () => {
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
      expect(epoch_tbl.rows[0].end_time).toBe(txEpochTime + 3*epochDuration);
      expect(epoch_tbl.rows[0].seeds.length).toBe(1);
      expect(epoch_tbl.rows[0].seeds[0].seed).toBe('cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133');
      expect(epoch_tbl.rows[0].seeds[0].node).toBe(node1.name);
      expect(epoch_tbl.rows[0].seeds[0].signature).toBe("");
      expect(epoch_tbl.rows[0].resolvers.length).toBe(0);
    });

    it('should another node ping for next epoch', async () => {
      await node2.transfer(orngContract.name, '100000.00000000 WAX', 'stake');

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node2.name,
          id: 0,
          exponent: signingKey[1].exponent,
          modulus: signingKey[1].modulus,
        },
        [{ actor: node2.name, permission: 'active' }]
      );

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node2.name,
          id: 1,
          exponent: signingKey[1].exponent1,
          modulus: signingKey[1].modulus1,
        },
        [{ actor: node2.name, permission: 'active' }]
      );

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
      expect(epoch_tbl.rows[0].seeds[1].seed).toBe('f701ef06ecae622236044b2d116c82e5ac63a1537d624ad09616411796eb4469');
      expect(epoch_tbl.rows[0].seeds[1].node).toBe(node2.name);
      expect(epoch_tbl.rows[0].seeds[1].signature).toBe("");
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

  describe('nodesignature tests', () => {
    it('should throw if missing owner permission', async () => {
      await expect(
        orngContract.contract.action.nodesignature(
          {
            owner: node1.name,
            signature: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
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
        orngContract.contract.action.nodesignature(
          {
            owner: node1.name,
            signature: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
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
        orngContract.contract.action.nodesignature(
          {
            owner: node1.name,
            signature: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
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

    it('should throw if epoch is not in submit signature phase', async () => {
      await expect(
        orngContract.contract.action.nodesignature(
          {
            owner: node1.name,
            signature: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('epoch not allow to submiting seed in this time');
    });

    it('should throw if node seed not found', async () => {
      await orngContract.contract.action.noderegister(
        {
          owner: node3.name,
        },
        [
          {
            actor: node3.name,
            permission: 'active',
          },
        ]
      );
      await node3.transfer(orngContract.name, '100000.00000000 WAX', 'stake');

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node3.name,
          id: 0,
          exponent: signingKey[2].exponent,
          modulus: signingKey[2].modulus,
        },
        [{ actor: node3.name, permission: 'active' }]
      );

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node3.name,
          id: 1,
          exponent: signingKey[2].exponent1,
          modulus: signingKey[2].modulus1,
        },
        [{ actor: node3.name, permission: 'active' }]
      );

      await chain.time.increase(epochDuration);
      await expect(
        orngContract.contract.action.nodesignature(
          {
            owner: node3.name,
            signature: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node3.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Node seed for next epoch not found');
    });

    it('should throw if signature is not valid', async () => {
      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const node1Seed = epoch_tbl.rows[0].seeds.find(s => s.node === node1.name);
      await expect(
        orngContract.contract.action.nodesignature(
          {
            owner: node1.name,
            signature: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Could not verify signature.');
    });

    it('should node1 submit signature', async () => {
      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const node1Seed = epoch_tbl.rows[0].seeds.find(s => s.node === node1.name);
      const rsaSigning = new RSASigning(signingKey[0].privateKey);

      const signedValue = rsaSigning.signSeed(
        node1Seed.seed
      );

      await orngContract.contract.action.nodesignature(
        {
          owner: node1.name,
          signature: signedValue,
        },
        [
          {
            actor: node1.name,
            permission: 'active',
          },
        ]
      );

      let epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const node1SeedAfter = epoch_tbl_after.rows[0].seeds.find(s => s.node === node1.name);
      expect(node1SeedAfter.signature).toBe(signedValue);
    });

    it('should node2 submit signature', async () => {
      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const node2Seed = epoch_tbl.rows[0].seeds.find(s => s.node === node2.name);
      const rsaSigning = new RSASigning(signingKey[1].privateKey);

      const signedValue = rsaSigning.signSeed(
        node2Seed.seed
      );

      await orngContract.contract.action.nodesignature(
        {
          owner: node2.name,
          signature: signedValue,
        },
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      let epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const node2SeedAfter = epoch_tbl_after.rows[0].seeds.find(s => s.node === node2.name);
      expect(node2SeedAfter.signature).toBe(signedValue);
    });

    it('should throw if already submited signature', async () => {
      let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const node2Seed = epoch_tbl.rows[0].seeds.find(s => s.node === node2.name);
      const rsaSigning = new RSASigning(signingKey[1].privateKey);

      const signedValue = rsaSigning.signSeed(
        node2Seed.seed
      );

      await expect(orngContract.contract.action.nodesignature(
        {
          owner: node2.name,
          signature: signedValue,
        },
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('seed signature already submited');

      let epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      const node2SeedAfter = epoch_tbl_after.rows[0].seeds.find(s => s.node === node2.name);
      expect(node2SeedAfter.signature).toBe(signedValue);
    });
  });

  describe('resolveepoch tests', () => {
    it('should do nothing if epoch has not started yet', async () => {
      let epoch_tbl_before = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_before.rows.length).toBe(1);
      expect(epoch_tbl_before.rows[0].id).toBe(1);
      expect(epoch_tbl_before.rows[0].resolvers.length).toBe(0);

      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      let epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after.rows.length).toBe(1);
      expect(epoch_tbl_after.rows[0].id).toBe(1);
      expect(epoch_tbl_after.rows[0].resolvers.length).toBe(0);
    });

    it('should skip epoch if number of active node is not satisfy minimum', async () => {
      await chain.time.increase(2*epochDuration + 1);
      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );
      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });

      expect(decentralize_config_tbl.rows.length).toBe(1);
      expect(decentralize_config_tbl.rows[0].current_epoch_id).toBe(1);

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl.rows[0].seeds.length).toBe(2);
    });

    it('should resolve epoch and assign random resolvers', async () => {
      console.log('----- nodes ping');
      await nodesPing(orngContract, [ node1, node2]);

      console.log('----- await orngContract.contract.action.nodeping');
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

      const epoch_tbl_before = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_before.rows.length).toBe(2);
      expect(epoch_tbl_before.rows[1].resolvers.length).toBe(0);
      expect(epoch_tbl_before.rows[1].seeds.length).toBe(3);

      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      expect(decentralize_config_tbl.rows[0].current_epoch_id).toBe(1);

      await chain.time.increase(2*epochDuration);

      console.log('----- resolveepoch');
      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      console.log('----- resolveepoch done');
      const decentralize_config_tbl_after = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });

      expect(decentralize_config_tbl_after.rows[0].current_epoch_id).toBe(2);

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(2);
      expect(epoch_tbl.rows[1].resolvers.length).toBe(1);
      expect(epoch_tbl.rows[1].seeds.length).toBe(3);

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

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node4.name,
          id: 0,
          exponent: signingKey[3].exponent,
          modulus: signingKey[3].modulus,
        },
        [{ actor: node4.name, permission: 'active' }]
      );

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node4.name,
          id: 1,
          exponent: signingKey[3].exponent1,
          modulus: signingKey[3].modulus1,
        },
        [{ actor: node4.name, permission: 'active' }]
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
      await orngContract.contract.action.decenconfig(
        {
          epoch_duration: epochDuration,
          number_of_resolver: 3,
          node_min_stake: '10000000000000',
          min_active_node: 5,
          job_fail_threshold: 2,
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
        },
        [
          {
            actor: node5.name,
            permission: 'active',
          },
        ]
      );

      await node5.transfer(orngContract.name, '100000.00000000 WAX', 'stake');

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node5.name,
          id: 0,
          exponent: signingKey[4].exponent,
          modulus: signingKey[4].modulus,
        },
        [{ actor: node5.name, permission: 'active' }]
      );

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node5.name,
          id: 1,
          exponent: signingKey[4].exponent1,
          modulus: signingKey[4].modulus1,
        },
        [{ actor: node5.name, permission: 'active' }]
      );
    });

    it('should 5 node ping and pick 3 resolvers for next epoch', async () => {
      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      const currentEpochId = +decentralize_config_tbl.rows[0].current_epoch_id;

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
      let decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      const currentEpochId = +decentralize_config_tbl.rows[0].current_epoch_id;

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
      decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });

      expect(decentralize_config_tbl.rows.length).toBe(1);
      expect(decentralize_config_tbl.rows[0].current_epoch_id).toBe(currentEpochId + 1);

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
        expect(jobs_tbl_after.rows[0].resolver_seeds.length).toBe(i + 1);

        const resolverSeedRecord = jobs_tbl_after.rows[0].resolver_seeds.find(rs => rs.resolver === resolvers[i]);

        expect(resolverSeedRecord).not.toBeUndefined();
        expect(resolverSeedRecord.seed).toBe(crypto.createHash('sha256').update(signedValue).digest('hex'));
      }

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_after.rows[0].resolver_seeds.length).toBe(2);
      // expect order by resolver name
      expect(jobs_tbl_after.rows[0].resolver_seeds[0].resolver < jobs_tbl_after.rows[0].resolver_seeds[1].resolver).toBe(true);
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
      expect(jobs_tbl_after.rows[0].resolver_seeds.length).toBe(2);
      const resolverSeedRecord = jobs_tbl_after.rows[0].resolver_seeds.find(rs => rs.resolver === resolvers[1]);
      expect(resolverSeedRecord).not.toBeUndefined();

      let decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      const currentEpochId = +decentralize_config_tbl.rows[0].current_epoch_id;

      expect(jobs_tbl_after.rows[0].last_resolve_epoch).toBe(currentEpochId);
    });

    it('next epoch comming with new set of resolvers and remaining submited seed jobs in previous epoch without completed', async () => {
      let decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      const currentEpochId = +decentralize_config_tbl.rows[0].current_epoch_id;

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

      decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      expect(decentralize_config_tbl.rows[0].current_epoch_id).toBe(currentEpochId + 1);

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      expect(jobs_tbl_after.rows.length).toBe(2);
      expect(jobs_tbl_after.rows[0].resolver_seeds.length).toBe(1); // job did not collect enough seeds in previous epoch will be clear and add new seed in this epoch
      expect(jobs_tbl_after.rows[0].resolver_seeds[0].seed).toBe(crypto.createHash('sha256').update(signedValue).digest('hex'));
      expect(jobs_tbl_after.rows[0].resolver_seeds[0].resolver).toBe(resolvers[2]);
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

  describe('test claim reward', () => {
    it('throw if no reward balance', async () => {
      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      expect(decentralize_config_tbl.rows[0].total_processed_jobs > 0).toBe(true);
      expect(decentralize_config_tbl.rows[0].total_reward).toBe(0);

      const node_tbl = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name,
        lower_bound: resolvers[0],
        upper_bound: resolvers[0]
      });

      expect(node_tbl.rows[0].job_count > 0).toBe(true);

      await expect(orngContract.contract.action.claimreward(
        {
          owner: resolvers[0],
        },
        [
          {
            actor: resolvers[0],
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('node has no reward');
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
        orngContract.contract.action.claimreward(
          {
            owner: resolvers[0],
          },
          [
            {
              actor: resolvers[0],
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

    it('deposit reward', async () => {
      await orngOracle.transfer(orngContract.name, '100000.00000000 WAX', 'reward');

      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      expect(decentralize_config_tbl.rows[0].total_reward).toBe('10000000000000');
    });

    it('node process job to get reward', async () => {
      for (let e = 0; e < 4; e++) {
        await nodesPing(orngContract, [node1, node4, node2, node5, node3]);

        let epoch_tbl = await orngContract.contract.table['epoch.a'].get({
          scope: orngContract.name
        });
        const chainInfo = await chain.getInfo();
        const chainHeadTime = Math.floor((new Date(chainInfo.head_block_time)).getTime()/1000);
        let nextEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 1];
        let currentEpoch = epoch_tbl.rows[epoch_tbl.rows.length - 2];

        const timeUntilEndTime = currentEpoch.end_time - chainHeadTime + 1;
        if (timeUntilEndTime > 0) {
          await chain.time.increase(timeUntilEndTime);
        }

        resolvers = findResolerOfEpoch(nextEpoch, 3);

        for (let i = 0; i < 10; i++) {
          await orngContract.contract.action.requestrand(
            {
              assoc_id: 0,
              signing_value: 111116 + e*10 + i,
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

          const node_tbl_before = await orngContract.contract.table['node.a'].get({
            scope: orngContract.name,
            lower_bound: resolvers[2],
            upper_bound: resolvers[2]
          });
          const jobCountResolver = node_tbl_before.rows[0].job_count;

          for (let j = 0; j <= 2; j++) {
            const nodeIndex = +(resolvers[j].replace('node', '')) - 1;
            const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

            const signedValue = rsaSigning.generateRandomNumber(
              jobs_tbl_before.rows[0].signing_value
            );

            await orngContract.contract.action.setranddecen(
              {
                resolver: resolvers[j],
                job_id: jobs_tbl_before.rows[0].id,
                random_value: signedValue,
              },
              [
                {
                  actor: resolvers[j],
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
        }
      }
    }, 100000);

    it('node claim reward', async () => {
      const node_tbl = await orngContract.contract.table['node.a'].get({
        scope: orngContract.name
      });
      const nodeHasReward = node_tbl.rows.filter(n => n.job_count > 0);

      let decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });

      let decenconfig = decentralize_config_tbl.rows[0];
      expect(decenconfig.total_processed_jobs > 0).toBe(true);

      for(let node of nodeHasReward) {
        const totalProcessedJobs = decenconfig.total_processed_jobs;
        const totalReward = decenconfig.total_reward;
        const nodeAccount = new Account(chain, node.owner);
        const nodeBalanceBefore = await nodeAccount.getBalance();

        await orngContract.contract.action.claimreward(
          {
            owner: nodeAccount.name
          },
          [
            {
              actor: nodeAccount.name,
              permission: 'active',
            },
          ]
        );

        const nodeBalanceAfter = await nodeAccount.getBalance();

        const expectedNodeBalance = Math.floor((node.job_count*decenconfig.total_reward)/totalProcessedJobs);
        expect(Math.ceil(nodeBalanceAfter.amount*10**8 - nodeBalanceBefore.amount*10**8)).toBe(expectedNodeBalance);

        decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
          scope: orngContract.name
        });
  
        decenconfig = decentralize_config_tbl.rows[0];
        expect(+decenconfig.total_processed_jobs).toBe(totalProcessedJobs - node.job_count);
        expect(+decenconfig.total_reward).toBe(totalReward - expectedNodeBalance);

        const node_tbl_after = await orngContract.contract.table['node.a'].get({
          scope: orngContract.name,
          lower_bound: node.owner,
          upper_bound: node.owner
        });
        expect(node_tbl_after.rows[0].job_count).toBe(0);
      }
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
      let decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      const currentEpochId = +decentralize_config_tbl.rows[0].current_epoch_id;

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
      )).rejects.toThrowError('unable to find resolvers for this epoch');
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

  describe('jobsfail test', () => {
    let jobFail;
    beforeAll(async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_before.rows.length).toBe(1);

      jobFail = jobs_tbl_before.rows[0];
    })
    it('should throw if missing resolver permission', async () => {
      await expect(orngContract.contract.action.jobsfail(
        {
          resolver: resolvers[0],
          job_ids: [jobFail.id],
        },
        [
          {
            actor: resolvers[1],
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('missing authority of ' + resolvers[0]);
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
        orngContract.contract.action.jobsfail(
          {
            resolver: resolvers[0],
            job_ids: [jobFail.id],
          },
          [
            {
              actor: resolvers[0],
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
        orngContract.contract.action.jobsfail(
          {
            resolver: resolvers[0],
            job_ids: [jobFail.id],
          },
          [
            {
              actor: resolvers[0],
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

    it('should throw if node not found', async () => {
      await expect(
        orngContract.contract.action.jobsfail(
          {
            resolver: orngOracle.name,
            job_ids: [jobFail.id],
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Resolver not found, please register first');
    });

    it('should throw if not is not a valid resolver for this epoch', async () => {
      let nodeIsNotResolver;
      for (let i = 0; i< 5; i++) {
        if (!resolvers.includes('node' + i)) {
          nodeIsNotResolver = 'node' + i;
        }
      }

      await expect(
        orngContract.contract.action.jobsfail(
          {
            resolver: nodeIsNotResolver,
            job_ids: [jobFail.id],
          },
          [
            {
              actor: nodeIsNotResolver,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Node is not a valid resolver for this epoch');
    });

    it('should first resolver submit job fails', async () => {
      await orngContract.contract.action.jobsfail(
        {
          resolver: resolvers[0],
          job_ids: [jobFail.id],
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
      expect(jobs_tbl_after.rows.length).toBe(1);
      expect(jobs_tbl_after.rows[0].resolvers_fail.length).toBe(1);
      expect(jobs_tbl_after.rows[0].resolvers_fail[0]).toBe(resolvers[0]);
    });

    it('should throw if already submitted fail job', async () => {
      await expect(orngContract.contract.action.jobsfail(
        {
          resolver: resolvers[0],
          job_ids: [jobFail.id],
        },
        [
          {
            actor: resolvers[0],
            permission: 'active',
          },
        ]
      )).rejects.toThrowError('Already submit fail for this job');
    });

    it('should second resolver submit job fails and erase job record', async () => {
      await orngContract.contract.action.jobsfail(
        {
          resolver: resolvers[1],
          job_ids: [jobFail.id],
        },
        [
          {
            actor: resolvers[1],
            permission: 'active',
          },
        ]
      );

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_after.rows.length).toBe(0);
    });
  });

  describe.skip('every active node has the same probability to become resolvers', () => {
    it('pick random resolvers', async () => {
      let probability = {
        node1: 0,
        node2: 0,
        node3: 0,
        node4: 0,
        node5: 0,
      }
      for (let i = 0; i < 100; i++) {
        let decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
          scope: orngContract.name
        });
        const currentEpochId = +decentralize_config_tbl.rows[0].current_epoch_id;

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
        decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
          scope: orngContract.name
        });

        expect(decentralize_config_tbl.rows[0].current_epoch_id).toBe(currentEpochId + 1);

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
