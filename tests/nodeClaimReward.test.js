const { Chain, Account } = require('qtest-js');
const { RSASigning } = require('./rsaSigning.js');
const { findResolerOfEpoch, getSigningKey, DECENTRALIZE_MODE, nodesPing, nodesSignature, setupProducer } = require('./utils.js');

let signingKey = getSigningKey();

describe('test decentralize node claim reward', () => {
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

    await setupProducer(chain, orngContract, [node1, node2, node3, node4, node5]);

    await orngContract.contract.action.decenconfig(
      {
        epoch_duration: epochDuration,
        number_of_resolver: 3,
        number_of_seed: 3,
        min_active_node: 5
      },
      [
        {
          actor: orngContract.name,
          permission: 'active',
        },
      ]
    );

    await orngContract.contract.action.setnodpubkey(
      {
        owner: node1.name,
        id: 0,
        exponent: signingKey[0].exponent,
        modulus: signingKey[0].modulus,
      },
      [{ actor: node1.name, permission: 'active' }]
    );

    await orngContract.contract.action.setnodpubkey(
      {
        owner: node1.name,
        id: 1,
        exponent: signingKey[0].exponent1,
        modulus: signingKey[0].modulus1,
      },
      [{ actor: node1.name, permission: 'active' }]
    );

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
  }, 30000);

  afterAll(async () => {
    await chain.clear();
  }, 10000);

  it('should throw if contract is paused', async () => {
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
      orngContract.contract.action.claimreward(
        {
          owner: node1.name,
        },
        [
          {
            actor: node1.name,
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
      // setup epoch with list of resolvers
      let txResult = await nodesPing(orngContract, [node1, node2, node3, node4, node5]);
      let epoch_seed_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      let currentChainTime = Math.floor(new Date(txResult.processed.block_time).getTime()/1000);

      await chain.time.increase(epoch_seed_tbl.rows[0].end_submit_seed_time - currentChainTime + 1);

      txResult = await nodesSignature(orngContract, [node1, node2, node3, node4, node5]);

      let epoch_signature_tbl = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_signature_tbl.rows[0].seeds.length).toBe(5);

      resolvers = findResolerOfEpoch(epoch_signature_tbl.rows[0], 3);

      currentChainTime = Math.floor(new Date(txResult.processed.block_time).getTime()/1000);
      await chain.time.increase(epoch_signature_tbl.rows[0].end_submit_signature_time - currentChainTime + 1);

      await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      // resolvers process job in epoch
      for (let i = 0; i < 10; i++) {
        await orngContract.contract.action.requestrand(
          {
            assoc_id: 0,
            signing_value: 111117 + e*10 + i,
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
        let jobCountResolver = 0;
        if (node_tbl_before.rows.length > 0) {
          jobCountResolver = node_tbl_before.rows[0].job_count;
        }

        for (let j = 0; j <= 2; j++) {
          const nodeIndex = +(resolvers[j].replace('node', '')) - 1;
          const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

          const signedValue = rsaSigning.generateRandomNumber(
            jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].signing_value
          );

          await orngContract.contract.action.setranddecen(
            {
              resolver: resolvers[j],
              job_id: jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].id,
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

        await orngContract.contract.action.executejob(
          {
            job_id: jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].id,
          },
          [
            {
              actor: node1.name,
              permission: 'active',
            },
          ]
        );

        const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
          scope: orngContract.name
        });

        expect(jobs_tbl_after.rows.length).toBe(jobs_tbl_before.rows.length - 1);

        const node_tbl_after = await orngContract.contract.table['node.a'].get({
          scope: orngContract.name,
          lower_bound: resolvers[2],
          upper_bound: resolvers[2]
        });
        expect(node_tbl_after.rows[0].job_count).toBe(jobCountResolver + 1);
      }
    }
  }, 200000);

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

  it('throw if no reward balance', async () => {
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
});
