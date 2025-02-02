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

  describe('epoch with 3 resolvers', () => {
    it('should 5 nodes ping and pick 3 resolvers for next epoch', async () => {
      await orngContract.contract.action.decenconfig(
        {
          epoch_duration: epochDuration,
          number_of_resolver: 3,
          number_of_seed: 3,
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

      await nodesPing(orngContract, [node1, node2, node3, node4, node5]);

      let epoch_seed_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl.rows[0].id).toBe(1);
      expect(epoch_seed_tbl.rows[0].seeds.length).toBe(5);

      await chain.time.increase(epochDuration);
      await nodesSignature(orngContract, [node1, node2, node3, node4, node5]);

      let epoch_signature_tbl = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_signature_tbl.rows[0].id).toBe(1);
      expect(epoch_signature_tbl.rows[0].seeds.length).toBe(5);

      resolvers = findResolerOfEpoch(epoch_signature_tbl.rows[0], 3);

      let epoch_seed_tbl_after = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl_after.rows[0].id).toBe(2);
      expect(epoch_seed_tbl_after.rows[0].seeds.length).toBe(0);
    }, 30000);

    it('should hash and pick 3 resolvers for next epoch', async () => {
      await chain.time.increase(epochDuration);

      const txResult = await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );
      let epoch_signature_tbl = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_signature_tbl.rows[0].id).toBe(2);
      expect(epoch_signature_tbl.rows[0].seeds.length).toBe(0);

      const epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after.rows[0].id).toBe(1);
      expect(epoch_tbl_after.rows[0].resolvers.length).toBe(3);
      expect(epoch_tbl_after.rows[0].resolvers[0]).toBe(resolvers[0]);
      expect(epoch_tbl_after.rows[0].resolvers[1]).toBe(resolvers[1]);
      expect(epoch_tbl_after.rows[0].resolvers[2]).toBe(resolvers[2]);

      const txEpochTime = Math.floor(new Date(txResult.processed.block_time).getTime()/1000);
      expect(epoch_tbl_after.rows[0].end_time > txEpochTime).toBe(true);
    });

    it('2 resolver submit seed for job', async () => {
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 0,
          signing_value: 111111,
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

      expect(jobs_tbl_before.rows.length).toBe(2);

      for (let i = 0; i < 2; i++) {
        const nodeIndex = +(resolvers[i].replace('node', '')) - 1;
        const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

        const signedValue = rsaSigning.generateRandomNumber(
          jobs_tbl_before.rows[1].signing_value
        );
        await orngContract.contract.action.setranddecen(
          {
            resolver: resolvers[i],
            job_id: jobs_tbl_before.rows[1].id,
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

        expect(jobs_tbl_after.rows.length).toBe(2);
        expect(jobs_tbl_after.rows[1].resolver_seeds.length).toBe(i + 1);

        const resolverSeedRecord = jobs_tbl_after.rows[1].resolver_seeds.find(rs => rs.resolver === resolvers[i]);

        expect(resolverSeedRecord).not.toBeUndefined();
        expect(resolverSeedRecord.seed).toBe(crypto.createHash('sha256').update(signedValue).digest('hex'));
      }

      const jobs_tbl_after = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      expect(jobs_tbl_after.rows[1].resolver_seeds.length).toBe(2);
      // expect order by resolver name
      expect(jobs_tbl_after.rows[1].resolver_seeds[0].resolver < jobs_tbl_after.rows[1].resolver_seeds[1].resolver).toBe(true);
    });

    it('throw if already submit seed for job', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      const nodeIndex = +(resolvers[0].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[1].signing_value
      );
      await expect(orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[0],
          job_id: jobs_tbl_before.rows[1].id,
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

    it('third resolver submit seed and reveal job final hash', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });
      const nodeIndex = +(resolvers[2].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[1].signing_value
      );

      await orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[2],
          job_id: jobs_tbl_before.rows[1].id,
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
      expect(jobs_tbl_after.rows[1].resolver_seeds.length).toBe(3);
      // expect order by resolver name
      expect(jobs_tbl_after.rows[1].resolver_seeds[1].resolver < jobs_tbl_after.rows[1].resolver_seeds[2].resolver).toBe(true);

      const revHashConcat = jobs_tbl_after.rows[1].resolver_seeds[0].seed + jobs_tbl_after.rows[1].resolver_seeds[1].seed + jobs_tbl_after.rows[1].resolver_seeds[2].seed;
      const finalHash = crypto.createHash('sha256').update(revHashConcat, 'hex').digest('hex');
      expect(jobs_tbl_after.rows[1].final_hash).toBe(finalHash);
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

      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      for (let i = 1; i <= 2; i++) {
        const nodeIndex = +(resolvers[i].replace('node', '')) - 1;
        const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

        const signedValue = rsaSigning.generateRandomNumber(
          jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].signing_value
        );

        await orngContract.contract.action.setranddecen(
          {
            resolver: resolvers[i],
            job_id: jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].id,
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

      expect(jobs_tbl_after.rows[jobs_tbl_before.rows.length - 1].resolver_seeds.length).toBe(2);
    });

    it('next epoch comming with new set of resolvers and remaining submited seed jobs in previous epoch without completed', async () => {
      await nodesPing(orngContract, [node1, node2, node3, node4, node5]);

      let epoch_seed_tbl = await orngContract.contract.table['epochseed.a'].get({
        scope: orngContract.name
      });
      expect(epoch_seed_tbl.rows[0].id).toBe(3);
      expect(epoch_seed_tbl.rows[0].seeds.length).toBe(5);

      await chain.time.increase(epochDuration);
      await nodesSignature(orngContract, [node1, node2, node3, node4, node5]);

      let epoch_signature_tbl = await orngContract.contract.table['epochsig.a'].get({
        scope: orngContract.name
      });
      expect(epoch_signature_tbl.rows[0].id).toBe(3);
      expect(epoch_signature_tbl.rows[0].seeds.length).toBe(5);

      resolvers = findResolerOfEpoch(epoch_signature_tbl.rows[0], 3);

      await chain.time.increase(epochDuration);

      const txResult = await orngContract.contract.action.resolveepoch(
        {},
        [
          {
            actor: node2.name,
            permission: 'active',
          },
        ]
      );

      const epoch_tbl_after = await orngContract.contract.table['epoch.a'].get({
        scope: orngContract.name
      });
      expect(epoch_tbl_after.rows[0].id).toBe(3);
      expect(epoch_tbl_after.rows[0].resolvers.length).toBe(3);
      expect(epoch_tbl_after.rows[0].resolvers[0]).toBe(resolvers[0]);
      expect(epoch_tbl_after.rows[0].resolvers[1]).toBe(resolvers[1]);
      expect(epoch_tbl_after.rows[0].resolvers[2]).toBe(resolvers[2]);

      const txEpochTime = Math.floor(new Date(txResult.processed.block_time).getTime()/1000);
      expect(epoch_tbl_after.rows[0].end_time > txEpochTime).toBe(true);

      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      // job already has some seeds submit in previous epoch
      expect(jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].resolver_seeds.length).toBe(2);

      const nodeIndex = +(resolvers[2].replace('node', '')) - 1;
      const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

      const signedValue = rsaSigning.generateRandomNumber(
        jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].signing_value
      );

      await orngContract.contract.action.setranddecen(
        {
          resolver: resolvers[2],
          job_id: jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].id,
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

      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds.length).toBe(1); // job did not collect enough seeds in previous epoch will be clear and add new seed in this epoch
      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds[0].seed).toBe(crypto.createHash('sha256').update(signedValue).digest('hex'));
      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds[0].resolver).toBe(resolvers[2]);
      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].last_resolve_epoch).toBe(3);
    }, 30000);

    it('all resolvers submit seeds and complete job', async () => {
      const jobs_tbl_before = await orngContract.contract.table['jobs.b'].get({
        scope: orngContract.name,
      });

      for (let i = 0; i < 2; i++) {
        const nodeIndex = +(resolvers[i].replace('node', '')) - 1;
        const rsaSigning = new RSASigning(signingKey[nodeIndex].privateKey);

        const signedValue = rsaSigning.generateRandomNumber(
          jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].signing_value
        );

        await orngContract.contract.action.setranddecen(
          {
            resolver: resolvers[i],
            job_id: jobs_tbl_before.rows[jobs_tbl_before.rows.length - 1].id,
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
        scope: orngContract.name
      });
      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds.length).toBe(3);
      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].last_resolve_epoch).toBe(3);

      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds[0].resolver < jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds[1].resolver).toBe(true);

      const revHashConcat = jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds[0].seed + jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds[1].seed + jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].resolver_seeds[2].seed;
      const finalHash = crypto.createHash('sha256').update(revHashConcat, 'hex').digest('hex');
      expect(jobs_tbl_after.rows[jobs_tbl_after.rows.length - 1].final_hash).toBe(finalHash);
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
