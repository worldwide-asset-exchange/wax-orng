const { Chain, Account } = require('qtest-js');
const { RSASigning } = require('./rsaSigning.js');
const { findResolerOfEpoch, getSigningKey, DECENTRALIZE_MODE, ORACLE_MODE, nodesPing, nodesSignature, setupProducer } = require('./utils.js');

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

  it('should throw if missing resolver permission', async () => {
    await expect(orngContract.contract.action.jobsfail(
      {
        resolver: node1.name,
        job_ids: [1],
      },
      [
        {
          actor: node2.name,
          permission: 'active',
        },
      ]
    )).rejects.toThrowError('missing authority of ' + node1.name);
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
          resolver: node1.name,
          job_ids: [1],
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
      orngContract.contract.action.jobsfail(
        {
          resolver: node1.name,
          job_ids: [1],
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

  it('should throw if unable to find resolvers for this epoch', async () => {
    await chain.time.increase(epochDuration);

    await expect(
      orngContract.contract.action.jobsfail(
        {
          resolver: node1.name,
          job_ids: [1],
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

  it('should first resolver submit job fails', async () => {
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

    await orngContract.contract.action.requestrand(
      {
        assoc_id: 0,
        signing_value: 111117,
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

    await orngContract.contract.action.jobsfail(
      {
        resolver: resolvers[0],
        job_ids: [jobs_tbl.rows[jobs_tbl.rows.length - 1].id],
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
    expect(jobs_tbl_after.rows[jobs_tbl.rows.length - 1].resolvers_fail.length).toBe(1);
    expect(jobs_tbl_after.rows[jobs_tbl.rows.length - 1].resolvers_fail[0]).toBe(resolvers[0]);
  }, 30000);

  it('should throw if already submitted fail job', async () => {
    const jobs_tbl = await orngContract.contract.table['jobs.b'].get({
      scope: orngContract.name,
    });

    await expect(orngContract.contract.action.jobsfail(
      {
        resolver: resolvers[0],
        job_ids: [jobs_tbl.rows[jobs_tbl.rows.length - 1].id],
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
    const jobs_tbl = await orngContract.contract.table['jobs.b'].get({
      scope: orngContract.name,
    });

    await orngContract.contract.action.jobsfail(
      {
        resolver: resolvers[1],
        job_ids: [jobs_tbl.rows[jobs_tbl.rows.length - 1].id],
      },
      [
        {
          actor: resolvers[1],
          permission: 'active',
        },
      ]
    );

    await orngContract.contract.action.jobsfail(
      {
        resolver: resolvers[2],
        job_ids: [jobs_tbl.rows[jobs_tbl.rows.length - 1].id],
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
      lower_bound: jobs_tbl.rows[jobs_tbl.rows.length - 1].id,
      upper_bound: jobs_tbl.rows[jobs_tbl.rows.length - 1].id
    });
    expect(jobs_tbl_after.rows.length).toBe(0);
  });
});
