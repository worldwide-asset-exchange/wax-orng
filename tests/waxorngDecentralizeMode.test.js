const { Chain, Account } = require('qtest-js');

const crypto = require('crypto');
const { RSASigning } = require('./rsaSigning.js');
const { findResolerOfEpoch, sleep, getSigningKey, nodesPing, nodesSignature, setupProducer, ORACLE_MODE, DECENTRALIZE_MODE } = require('./utils.js');

let signingKey = getSigningKey();

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

  beforeAll(async () => {
    jest.setTimeout(30000);

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

    await setupProducer(chain, orngContract, [node1, node2, node3]);
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
            number_of_seed: 1,
            min_active_node: 3
          },
          [
            {
              actor: node2.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('missing authority of ' + orngContract.name);
    }, 5000);

    it('should throw if min_active_node greater than number_of_resolver', async () => {
      await expect(
        orngContract.contract.action.decenconfig(
          {
            epoch_duration: epochDuration,
            number_of_resolver: 5,
            number_of_seed: 1,
            min_active_node: 3
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

    it('should throw if number_of_resolver must be less than 21', async () => {
      await expect(
        orngContract.contract.action.decenconfig(
          {
            epoch_duration: epochDuration,
            number_of_resolver: 3,
            number_of_seed: 1,
            min_active_node: 34
          },
          [
            {
              actor: orngContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('min_active_node must be less than 21');
    });

    it('should throw if number_of_seed greater than number_of_resolver', async () => {
      await expect(
        orngContract.contract.action.decenconfig(
          {
            epoch_duration: epochDuration,
            number_of_resolver: 10,
            number_of_seed: 11,
            min_active_node: 15
          },
          [
            {
              actor: orngContract.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('number_of_seed must be less than or equal to number_of_resolver');
    });

    it('should set decentralize config', async () => {
      await orngContract.contract.action.decenconfig(
        {
          epoch_duration: epochDuration,
          number_of_resolver: 3,
          number_of_seed: 1,
          min_active_node: 5
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
      expect(decentralize_config_tbl.rows[0].number_of_seed).toBe(1);
      expect(decentralize_config_tbl.rows[0].total_reward).toBe(0);
      expect(decentralize_config_tbl.rows[0].total_processed_jobs).toBe(0);
    });

    it('should update decentralize config', async () => {
      await orngContract.contract.action.decenconfig(
        {
          epoch_duration: epochDuration,
          number_of_resolver: 1,
          number_of_seed: 1,
          min_active_node: 3
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
      expect(decentralize_config_tbl.rows[0].number_of_seed).toBe(1);
      expect(decentralize_config_tbl.rows[0].total_reward).toBe(0);
      expect(decentralize_config_tbl.rows[0].total_processed_jobs).toBe(0);
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

    it('should throw if node is not top 21 producers', async () => {
      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node4.name,
            seed: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node4.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Node is not top 21 producers');
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

    it('should throw if node has no signing key', async () => {
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
      ).rejects.toThrowError('Please update public key');
    });

    it('should throw if node has only one available signing key', async () => {
      await orngContract.contract.action.setnodpubkey(
        {
          owner: node3.name,
          id: 0,
          exponent: signingKey[2].exponent,
          modulus: signingKey[2].modulus,
        },
        [{ actor: node3.name, permission: 'active' }]
      );

      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node3.name,
            seed: 'cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133',
          },
          [
            {
              actor: node3.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Please make sure node has more than 2 available public key');
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

      epoch_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].id).toBe(1);

      const txEpochTime = Math.floor(new Date(txResult.processed.block_time).getTime()/1000);
      expect(epoch_tbl.rows[0].end_submit_seed_time).toBe(txEpochTime + epochDuration);
      expect(epoch_tbl.rows[0].seeds.length).toBe(1);
      expect(epoch_tbl.rows[0].seeds[0].seed).toBe('cdc43c7e9089a41897b101de70f878bcc575c839f4ad057605a3335f6a601133');
      expect(epoch_tbl.rows[0].seeds[0].node).toBe(node1.name);
      expect(epoch_tbl.rows[0].seeds[0].signature).toBe("");
      expect(epoch_tbl.rows[0].submit_signature_deadline).toBe(txEpochTime + 2*epochDuration);
    });

    it('should another node ping for next epoch', async () => {
      let epoch_tbl_before = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });

      await orngContract.contract.action.setnodpubkey(
        {
          owner: node3.name,
          id: 1,
          exponent: signingKey[2].exponent1,
          modulus: signingKey[2].modulus1,
        },
        [{ actor: node3.name, permission: 'active' }]
      );

      await orngContract.contract.action.nodeping(
        {
          owner: node3.name,
          seed: 'f701ef06ecae622236044b2d116c82e5ac63a1537d624ad09616411796eb4469',
        },
        [
          {
            actor: node3.name,
            permission: 'active',
          },
        ]
      );

      let epoch_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].id).toBe(1);

      expect(epoch_tbl.rows[0].seeds.length).toBe(2);
      expect(epoch_tbl.rows[0].seeds[1].seed).toBe('f701ef06ecae622236044b2d116c82e5ac63a1537d624ad09616411796eb4469');
      expect(epoch_tbl.rows[0].seeds[1].node).toBe(node3.name);
      expect(epoch_tbl.rows[0].seeds[1].signature).toBe("");

      // epoch seed already started, just add new seed without changing time
      expect(epoch_tbl.rows[0].end_submit_seed_time).toBe(epoch_tbl_before.rows[0].end_submit_seed_time);
      expect(epoch_tbl.rows[0].submit_signature_deadline).toBe(epoch_tbl_before.rows[0].submit_signature_deadline);
    }, 5000);

    it('should another node ping for next epoch and seed should sort by node name', async () => {
      let epoch_tbl_before = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });

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
          seed: 'e68cabb4ddff6dafb008b337fb099a40bc3961839161a0571d137f5e284460c4',
        },
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      let epoch_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });

      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].id).toBe(1);

      expect(epoch_tbl.rows[0].seeds.length).toBe(3);

      // stored seeds sorted by node name
      expect(epoch_tbl.rows[0].seeds[0].node).toBe(node1.name);
      expect(epoch_tbl.rows[0].seeds[1].node).toBe(node2.name);
      expect(epoch_tbl.rows[0].seeds[2].node).toBe(node3.name);

      expect(epoch_tbl.rows[0].seeds[1].seed).toBe('e68cabb4ddff6dafb008b337fb099a40bc3961839161a0571d137f5e284460c4');

      // epoch seed already started, just add new seed without changing time
      expect(epoch_tbl.rows[0].end_submit_seed_time).toBe(epoch_tbl_before.rows[0].end_submit_seed_time);
      expect(epoch_tbl.rows[0].submit_signature_deadline).toBe(epoch_tbl_before.rows[0].submit_signature_deadline);
    }, 5000);

    it('should throw if already submit seed for next epoch', async () => {
      await expect(
        orngContract.contract.action.nodeping(
          {
            owner: node2.name,
            seed: '94a2c0cfd08527103a5cb7cad47e255895eab8e8e9ff98235dd0f638f0b0881e',
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
      ).rejects.toThrowError('Current singature phase is ended');
    });

    it('should throw if node seed not found', async () => {
      await chain.time.increase(epochDuration);
      await expect(
        orngContract.contract.action.nodesignature(
          {
            owner: node4.name,
            signature: '806cbde957b4805e48d3c42127a0595ffadb218a6097e9f2b9302e6802cd171b',
          },
          [
            {
              actor: node4.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Node seed for next epoch not found');
    });

    it('should throw if signature is not valid', async () => {
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
      let epoch_seed_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });

      const node1Seed = epoch_seed_tbl.rows[0].seeds.find(s => s.node === node1.name);
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

      let epoch_signature_table = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });

      const node1SeedAfter = epoch_signature_table.rows[0].seeds.find(s => s.node === node1.name);
      expect(node1SeedAfter.seed).toBe(node1Seed.seed);
      expect(node1SeedAfter.signature).toBe(signedValue);

      expect(epoch_signature_table.rows[0].end_submit_signature_time).toBe(epoch_seed_tbl.rows[0].submit_signature_deadline);
      expect(epoch_signature_table.rows[0].resolve_deadline).toBe(epoch_seed_tbl.rows[0].submit_signature_deadline + epochDuration);

      let epoch_seed_tbl_after = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });

      // start new phase to submit seeds
      expect(epoch_seed_tbl_after.rows[0].id).toBe(2);
      expect(epoch_seed_tbl_after.rows[0].seeds.length).toBe(0);
      expect(epoch_seed_tbl_after.rows[0].end_submit_seed_time).toBe(epoch_seed_tbl.rows[0].submit_signature_deadline);
      expect(epoch_seed_tbl_after.rows[0].submit_signature_deadline).toBe(epoch_seed_tbl.rows[0].submit_signature_deadline + epochDuration);
    });

    it('should node2 submit signature', async () => {
      let epoch_signature_tbl_before = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });

      const node2Seed = epoch_signature_tbl_before.rows[0].seeds.find(s => s.node === node2.name);
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

      let epoch_signature_tbl_after = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });

      const node2SeedAfter = epoch_signature_tbl_after.rows[0].seeds.find(s => s.node === node2.name);
      expect(node2SeedAfter.seed).toBe(node2Seed.seed);
      expect(node2SeedAfter.signature).toBe(signedValue);

      expect(epoch_signature_tbl_after.rows[0].end_submit_signature_time).toBe(epoch_signature_tbl_before.rows[0].end_submit_signature_time);
      expect(epoch_signature_tbl_after.rows[0].resolve_deadline).toBe(epoch_signature_tbl_before.rows[0].resolve_deadline);
    });

    it('should throw if already submited signature', async () => {
      let epoch_signature_tbl_before = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });

      const node2Seed = epoch_signature_tbl_before.rows[0].seeds.find(s => s.node === node2.name);
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

      let epoch_signature_tbl_after = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });

      const node2SeedAfter = epoch_signature_tbl_after.rows[0].seeds.find(s => s.node === node2.name);
      expect(node2SeedAfter.signature).toBe(signedValue);

      expect(epoch_signature_tbl_after.rows[0].end_submit_signature_time).toBe(epoch_signature_tbl_before.rows[0].end_submit_signature_time);
      expect(epoch_signature_tbl_after.rows[0].resolve_deadline).toBe(epoch_signature_tbl_before.rows[0].resolve_deadline);
    });
  });

  describe('resolveepoch tests', () => {
    it('should do nothing if it is not time for phase transition', async () => {
      let epoch_seed_tbl_before = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_before.rows.length).toBe(1);
      expect(epoch_seed_tbl_before.rows[0].id).toBe(2);
      expect(epoch_seed_tbl_before.rows[0].seeds.length).toBe(0);

      let epoch_signature_tbl_before = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_signature_tbl_before.rows.length).toBe(1);
      expect(epoch_signature_tbl_before.rows[0].id).toBe(1);
      expect(epoch_signature_tbl_before.rows[0].seeds.length).toBe(3);
      expect(epoch_signature_tbl_before.rows[0].end_submit_signature_time).toBe(epoch_seed_tbl_before.rows[0].end_submit_seed_time);

      let epoch_tbl_before = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_before.rows.length).toBe(1);
      expect(epoch_tbl_before.rows[0].end_time).toBe(0);
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

      let epoch_seed_tbl_after = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_after.rows.length).toBe(1);
      expect(epoch_seed_tbl_after.rows[0].id).toBe(2);
      expect(epoch_seed_tbl_after.rows[0].seeds.length).toBe(0);
      expect(epoch_seed_tbl_after.rows[0].end_submit_seed_time).toBe(epoch_seed_tbl_before.rows[0].end_submit_seed_time);

      let epoch_signature_tbl_after = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_signature_tbl_after.rows.length).toBe(1);
      expect(epoch_signature_tbl_after.rows[0].id).toBe(1);
      expect(epoch_signature_tbl_after.rows[0].seeds.length).toBe(3);
      expect(epoch_signature_tbl_after.rows[0].end_submit_signature_time).toBe(epoch_signature_tbl_before.rows[0].end_submit_signature_time);

      let epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after.rows.length).toBe(1);
      expect(epoch_tbl_after.rows[0].end_time).toBe(0);
      expect(epoch_tbl_after.rows[0].resolvers.length).toBe(0);
    });

    it('should skip epoch if number of active node is not satisfy minimum', async () => {
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

      const epoch_tbl = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl.rows.length).toBe(1);
      expect(epoch_tbl.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl.rows[0].end_time).toBe(0);

      let epoch_seed_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl.rows.length).toBe(1);
      expect(epoch_seed_tbl.rows[0].id).toBe(3);
      expect(epoch_seed_tbl.rows[0].seeds.length).toBe(0);

      let epoch_signature_tbl = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_signature_tbl.rows.length).toBe(1);
      expect(epoch_signature_tbl.rows[0].id).toBe(2);
      expect(epoch_signature_tbl.rows[0].seeds.length).toBe(0);
      expect(epoch_signature_tbl.rows[0].end_submit_signature_time).toBe(epoch_seed_tbl.rows[0].end_submit_seed_time);
    });

    it('should resolve epoch and assign random resolvers', async () => {
      // Phase 1: 3 nodes submit seeds
      await nodesPing(orngContract, [ node1, node2, node3]);

      const epoch_tbl_before = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_before.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl_before.rows[0].end_time).toBe(0);

      const epoch_seed_tbl_before = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_before.rows[0].id).toBe(3);
      expect(epoch_seed_tbl_before.rows[0].seeds.length).toBe(3);

      const epoch_sigature_tbl_before = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_before.rows[0].id).toBe(2);
      expect(epoch_sigature_tbl_before.rows[0].seeds.length).toBe(0);

      await chain.time.increase(epochDuration);
      
      // Phase 2: 3 nodes submit signatures
      await nodesSignature(orngContract, [node1, node2, node3]);

      const epoch_seed_tbl_after = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_after.rows[0].id).toBe(4);
      expect(epoch_seed_tbl_after.rows[0].seeds.length).toBe(0);

      const epoch_sigature_tbl_after = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_after.rows[0].id).toBe(3);
      expect(epoch_sigature_tbl_after.rows[0].seeds.length).toBe(3);
      for (let seed of epoch_sigature_tbl_after.rows[0].seeds) {
        expect(seed.signature !== '').toBe(true);
      }

      const epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl_after.rows[0].end_time).toBe(0);

      await chain.time.increase(epochDuration);
      
      // Phase 3: pick resolvers base on seed signatures
      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      const epoch_seed_tbl_after1 = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_after1.rows[0].id).toBe(5);
      expect(epoch_seed_tbl_after1.rows[0].seeds.length).toBe(0);

      const epoch_sigature_tbl_after1 = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_after1.rows[0].id).toBe(4);
      expect(epoch_sigature_tbl_after1.rows[0].seeds.length).toBe(0);

      const epoch_tbl_after1 = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after1.rows[0].id).toBe(3);
      expect(epoch_tbl_after1.rows[0].resolvers.length).toBe(1);
      expect(epoch_tbl_after1.rows[0].end_time).toBe(epoch_seed_tbl_after1.rows[0].end_submit_seed_time);

      const resolvers = findResolerOfEpoch(epoch_sigature_tbl_after.rows[0], 1);
      expect(epoch_tbl_after1.rows[0].resolvers[0]).toBe(resolvers[0]);
    }, 30000);

    it('should clear resolvers list if epoch ended and not enough node active for next epoch', async () => {
      await chain.time.increase(epochDuration);
      
      // Phase 3: pick resolvers base on seed signatures
      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      const epoch_tbl_after1 = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after1.rows[0].id).toBe(3);
      expect(epoch_tbl_after1.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl_after1.rows[0].end_time).toBe(0);
    });

    it('should clear list of signatures if it is outdate', async () => {
      // Phase 1: 3 nodes submit seeds
      await nodesPing(orngContract, [ node1, node2, node3]);

      const epoch_tbl_before = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_before.rows[0].id).toBe(3);
      expect(epoch_tbl_before.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl_before.rows[0].end_time).toBe(0);

      const epoch_seed_tbl_before = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_before.rows[0].id).toBe(6);
      expect(epoch_seed_tbl_before.rows[0].seeds.length).toBe(3);

      const epoch_sigature_tbl_before = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_before.rows[0].id).toBe(5);
      expect(epoch_sigature_tbl_before.rows[0].seeds.length).toBe(0);

      await chain.time.increase(epochDuration);
      
      // Phase 2: 3 nodes submit signatures
      await nodesSignature(orngContract, [node1, node2, node3]);

      const epoch_seed_tbl_after = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_after.rows[0].id).toBe(7);
      expect(epoch_seed_tbl_after.rows[0].seeds.length).toBe(0);

      const epoch_sigature_tbl_after = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_after.rows[0].id).toBe(6);
      expect(epoch_sigature_tbl_after.rows[0].seeds.length).toBe(3);
      for (let seed of epoch_sigature_tbl_after.rows[0].seeds) {
        expect(seed.signature !== '').toBe(true);
      }

      const epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after.rows[0].id).toBe(3);
      expect(epoch_tbl_after.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl_after.rows[0].end_time).toBe(0);

      // more than 2 epochDuration pass without resolve epoch 6
      await chain.time.increase(2*epochDuration);

      // Phase 3: pick resolvers base on seed signatures
      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      const epoch_seed_tbl_after1 = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_after1.rows[0].id).toBe(8);
      expect(epoch_seed_tbl_after1.rows[0].seeds.length).toBe(0);

      const epoch_sigature_tbl_after1 = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_after1.rows[0].id).toBe(6);
      // signatures are cleared
      expect(epoch_sigature_tbl_after1.rows[0].seeds.length).toBe(0);

      const epoch_tbl_after1 = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after1.rows[0].id).toBe(3);
      // no resolvers are sellected because signatures is outdate
      expect(epoch_tbl_after1.rows[0].resolvers.length).toBe(0);
    }, 30000);

    it('should clear list of seeds if it is outdate', async () => {
      // Phase 1: 3 nodes submit seeds
      await nodesPing(orngContract, [ node1, node2, node3]);

      const epoch_seed_tbl_before = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_before.rows[0].id).toBe(8);
      expect(epoch_seed_tbl_before.rows[0].seeds.length).toBe(3);

      const epoch_sigature_tbl_before = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_before.rows[0].id).toBe(6);
      expect(epoch_sigature_tbl_before.rows[0].seeds.length).toBe(0);

      const epoch_tbl_before = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_before.rows[0].id).toBe(3);
      expect(epoch_tbl_before.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl_before.rows[0].end_time).toBe(0);

      // more than 2 epochDuration pass but node has not submit signature for epoch 8 yet
      await chain.time.increase(2*epochDuration);

      // no available seed to submit signature
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
      ).rejects.toThrowError('Current singature phase is ended');

      // resolve epoch increase epoch id of seed phase and clear seed list
      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      const epoch_seed_tbl_after = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_after.rows[0].id).toBe(9);
      expect(epoch_seed_tbl_after.rows[0].seeds.length).toBe(0);

      const epoch_sigature_tbl_after = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_sigature_tbl_after.rows[0].id).toBe(6);
      expect(epoch_sigature_tbl_after.rows[0].seeds.length).toBe(0);

      const epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after.rows[0].id).toBe(3);
      expect(epoch_tbl_after.rows[0].resolvers.length).toBe(0);
      expect(epoch_tbl_after.rows[0].end_time).toBe(0);
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

    it('should throw if epoch resolver is empty', async () => {
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
      ).rejects.toThrowError('unable to find resolvers for this epoch');
    });

    it('should throw if node is not resolver of current epoch', async () => {
      await nodesPing(orngContract, [ node1, node2, node3]);
      await chain.time.increase(epochDuration);
      await nodesSignature(orngContract, [node1, node2, node3]);

      const epoch_sigature_tbl = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      resolvers = await findResolerOfEpoch(epoch_sigature_tbl.rows[0], 1);
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

    it('should throw if signature is invalid', async () => {
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

      const signatureHash = crypto.createHash('sha256').update(signedValue).digest('hex');
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

      expect(jobs_tbl_after.rows.length).toBe(1);

      expect(jobs_tbl_after.rows[0].resolver_seeds[0].seed).toBe(signatureHash);
      const finalHash = crypto.createHash('sha256').update(signatureHash, 'hex').digest('hex');
      expect(jobs_tbl_after.rows[0].final_hash).toBe(finalHash);
    });
  });

  describe('test execute job', () => {
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
        orngContract.contract.action.executejob(
          {
            job_id: 1,
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
        orngContract.contract.action.executejob(
          {
            job_id: 1,
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

    it('should throw if job id not found', async () => {
      await expect(
        orngContract.contract.action.executejob(
          {
            job_id: 88899,
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

    it('should throw if job has not been resolved yet', async () => {
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 0,
          signing_value: 111116,
          caller: dappContract.name,
        },
        [
          {
            actor: dappContract.name,
            permission: 'active',
          },
        ]
      );

      const jobs_tbl = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      await expect(
        orngContract.contract.action.executejob(
          {
            job_id: jobs_tbl.rows[jobs_tbl.rows.length - 1].id,
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrowError('Job has not been resolved yet');
    });

    it('should execute job and update proccessed job count of each node', async () => {
      const jobs_tbl = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      const resolvedJobs = jobs_tbl.rows.filter(j => j.final_hash !== "0000000000000000000000000000000000000000000000000000000000000000");

      expect(resolvedJobs.length > 0).toBe(true);

      let totalProcessedJobs = 0;
      for (let job of resolvedJobs) {
        const node_tbl_before = await orngContract.contract.table['node.a'].get({
          scope: orngContract.name,
          lower_bound: job.resolver_seeds[0].resolver,
          upper_bound: job.resolver_seeds[0].resolver,
        });
        let jobCountBefore = 0
        if (node_tbl_before.rows.length > 0) {
          jobCountBefore = node_tbl_before.rows[0].job_count;
        }

        await orngContract.contract.action.executejob(
          {
            job_id: job.id,
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        );
        const node_tbl_after = await orngContract.contract.table['node.a'].get({
          scope: orngContract.name,
          lower_bound: job.resolver_seeds[0].resolver,
          upper_bound: job.resolver_seeds[0].resolver,
        });
        expect(node_tbl_after.rows[0].job_count).toBe(jobCountBefore + 1);

        totalProcessedJobs += job.resolver_seeds.length;
      }

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_after.rows.length).toBe(jobs_tbl.rows.length - resolvedJobs.length);

      const decentralize_config_tbl = await orngContract.contract.table['decentral.a'].get({
        scope: orngContract.name
      });
      expect(decentralize_config_tbl.rows.length).toBe(1);
      expect(decentralize_config_tbl.rows[0].total_processed_jobs).toBe(totalProcessedJobs);
    });
  });
});
