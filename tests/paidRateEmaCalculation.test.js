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

describe('test paid rate ema calculation', () => {
  let chain;
  let systemContract = 'eosio';
  let orngContract = 'orng.wax';
  let orngOracle = 'oracle.wax';
  let orngOracle2 = 'oracle2.wax';
  let orngOracle3 = 'oracle3.wax';
  let orngOracle4 = 'oracle4.wax';
  let treasuryAccount;

  // Test dapp accounts for staking scenarios
  let dapp1, dapp2, dapp3, dapp4;
  let staker1, staker2, staker3;

  const exponent0 = '10001';
  const modulus0 =
    'c61c159689a0bddad3b3855e29f996c91d358f8735d653272565957f9b184f4312b6fe1604adacbcbc9af99a8a9cebfeabd3e93fff3b1e5c7e7a95567e1671dd2b09e868dc54763cd3ecac29d0cb1bcf2a5b4ad39455f273a0d91c4adba1ddf8a79e49f9ca48b6c3f8a2280702317c213548d0ee24c2ec2a0fb8ff31196601cb988316dd0bb7830f8702a216e8369167c0a7a22336232a2291a26f1f2811a2ed81e02da627e07315c89ae376f3a7112b73c8661ab64411c99cdc80b77ce373edfd5e17a44a737e4321db373bcf87091ad02a64a09be58b7ad4d8610b58b018bc6c5136150746f2b7d0a83f2832caaafb2b9f30b5e978fe27974d36d2e9334b0eb7c739bda9e212e413ab8b05f4f42ab2d0447b2b152ae02901a3c755bc44ae494f3ee094643c6cc44f0e5a1d7e4220abb62ee595576e94c27e299fe7cb0568b11d638b7a4a8f332c626d704f3d38bf3ae7c2c9f265bac26611df6a7988b15bc8d743bac8f98d6de8fc68d3b6a46a563ffff4f3b58f90fea9fc96223bcf022083562fa69c810641f8d9d4e6ed9e4cfad24f2424d5cbaef058d8fbbd2b44ce59b5f1f2a5ca89f4c0801da6c816611fc6131e9741471bb49bdec6a78ab0559fa4b324f538ad34a0c1ac74a8fee99a7f73b0564312f3473ccd78354b15211d8d8136c31dd2ab1a566c95bcbf2c6e1c1870cb79562e9a9d5e7cabf96e45f37ac3e9c1';
  const privateKey0 = fs.readFileSync('./tests/resources/test_rsa_4096_priv_0.pem', 'utf8');
  const modulus0Id = stringHashToNum(crypto.createHash('sha256').update(modulus0).digest('hex'));

  function getRSAPrivateKey(version) {
    if (version == 1) {
      return privateKey0;
    }
  }

  beforeAll(async () => {
    jest.setTimeout(120000);

    chain = await Chain.setupChain('WAX');

    // Create ORNG contract
    orngContract = await chain.system.createAccount(orngContract, '10000.00000000 WAX', 4565215);

    // Create oracle accounts
    orngOracle = await chain.system.createAccount(orngOracle, '10000.00000000 WAX', 4565215);
    orngOracle2 = await chain.system.createAccount(orngOracle2, '10000.00000000 WAX', 4565215);
    orngOracle3 = await chain.system.createAccount(orngOracle3, '10000.00000000 WAX', 4565215);
    orngOracle4 = await chain.system.createAccount(orngOracle4, '10000.00000000 WAX', 4565215);

    // Create treasury account
    treasuryAccount = await chain.system.createAccount('treasury', '10000.00000000 WAX', 4565215);

    // Create test dapp accounts
    dapp1 = await chain.system.createAccount('dapp1', '10000.00000000 WAX', 4565215);
    dapp2 = await chain.system.createAccount('dapp2', '10000.00000000 WAX', 4565215);
    dapp3 = await chain.system.createAccount('dapp3', '10000.00000000 WAX', 4565215);
    dapp4 = await chain.system.createAccount('dapp4', '10000.00000000 WAX', 4565215);

    // Create staker accounts
    staker1 = await chain.system.createAccount('staker1', '10000.00000000 WAX', 4565215);
    staker2 = await chain.system.createAccount('staker2', '10000.00000000 WAX', 4565215);
    staker3 = await chain.system.createAccount('staker3', '10000.00000000 WAX', 4565215);

    // Deploy ORNG contract
    await orngContract.setContract({
      abi: './build/wax.orng.abi',
      wasm: './build/wax.orng.wasm',
    });
    await orngContract.addCode('active');

    // Set up receiver contracts for dapps
    await dapp1.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });
    await dapp1.addCode('active');

    // Initialize RSA public key
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

    // Set up oracles
    await orngContract.contract.action.setoracles(
      {
        oracles: [orngOracle.name, orngOracle2.name],
      },
      [
        {
          actor: orngContract.name,
          permission: 'active',
        },
      ]
    );

    // Configure initial settings
    await orngContract.contract.action.configv2(
      {
        fee_per_call: '0.00500000 WAX',
        strike_max: 3,
        k_calls_per_wax_numerator: 100000,  // 10 calls per WAX (100000/10000)
        free_calls_per_hour: 0,
        treas_hardfloor: 10,
      },
      [{ actor: orngContract.name, permission: 'active' }]
    );

    // Configure adaptive staking with default values
    await orngContract.contract.action.configadptive(
      {
        adaptive_stake_enabled: true,
        total_capacity_calls_per_hr: 18000,
        free_min_calls_per_hr: 900,
        headroom_calls_per_hr: 1800,
        per_dapp_min_calls_per_hr: 0,
        burst_window_hours: 100,
        ema_half_life_sec: 60,
        ema_min_update_sec: 10,
      },
      [
        {
          actor: orngContract.name,
          permission: 'active',
        },
      ]
    );

    // Fund treasury
    await treasuryAccount.transfer(orngContract.name, '10.00000000 WAX', 'treasury');
  });

  afterAll(async () => {
    await chain.clear();
  }, 10000);

  // Helper function to calculate EMA in JavaScript (matching C++ logic)
  function calculateEMA(prevEMA, paidCountWindow, dt, emaHalfLifeSec) {
    if (dt < 1) dt = 1;

    const tau = emaHalfLifeSec / Math.log(2.0);
    const g = Math.exp(-dt / Math.max(1.0, tau));
    const instRate = (paidCountWindow * 3600.0) / dt;
    const newEMA = g * prevEMA + (1.0 - g) * instRate;

    return newEMA;
  }

  // Helper function to submit random number from oracles
  async function submitRandom(id, seedHex, nonce, dapp, oracle) {
    const rsaSigning = new RSASigning(getRSAPrivateKey(1));
    const msg = make_msg(seedHex, dapp, nonce);
    const sig = rsaSigning.generateRandomNumber(msg);

    // Submit from first oracle (index 0)
    return await orngContract.contract.action.setrand(
      {
        oracle,
        id,
        ver: 1,
        sig: sig,
      },
      [
        {
          actor: oracle,
          permission: 'active',
        },
      ]
    );
  }

  it('should initialize rngstats with zero values', async () => {
    const rngstatsTable = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTable.rows.length).toBe(0);
  });

  it('First random job - only record job count ', async () => {
    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await dapp1.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dapp1.name);

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.contract.action.requestrand(
      {
        assoc_id: assocId,
        signing_value: signingValue,
        caller: dapp1.name,
      },
      [
        {
          actor: dapp1.name,
          permission: 'active',
        },
      ]
    );

    // Get request ID
    const requestTable = await orngContract.contract.table['reqs'].get({
      scope: orngContract.name,
    });
    let request = requestTable.rows[requestTable.rows.length - 1];

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name, orngOracle.name);

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);

    expect(+rngstatsTableAfter.rows[0].paid_rate_ema_ch).toBe(0);
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(tx.processed.block_time.split('.')[0]);
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(1);
  });

  it('Update job count if ema_min_update_sec has not been reached', async () => {
    const rngstatsTableBefore = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await dapp2.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dapp2.name);

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.contract.action.requestrand(
      {
        assoc_id: assocId,
        signing_value: signingValue,
        caller: dapp2.name,
      },
      [
        {
          actor: dapp2.name,
          permission: 'active',
        },
      ]
    );

    // Get request ID
    const requestTable = await orngContract.contract.table['reqs'].get({
      scope: orngContract.name,
    });
    let request = requestTable.rows[requestTable.rows.length - 1];

    // Submit random number from oracle
    await submitRandom(request.id, request.seed, request.nonce, dapp2.name, orngOracle.name);

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);

    expect(+rngstatsTableAfter.rows[0].paid_rate_ema_ch).toBe(0);
    // last_ema_update stay the same
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(rngstatsTableBefore.rows[0].last_ema_update);
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(2);
  });

  it('should paid rate ema after ema_min_update_sec', async () => {
    const rngstatsTableBefore = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await dapp3.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dapp3.name);

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.contract.action.requestrand(
      {
        assoc_id: assocId,
        signing_value: signingValue,
        caller: dapp1.name,
      },
      [
        {
          actor: dapp1.name,
          permission: 'active',
        },
      ]
    );

    // Get request ID
    const requestTable = await orngContract.contract.table['reqs'].get({
      scope: orngContract.name,
    });
    let request = requestTable.rows[requestTable.rows.length - 1];

    // Wait more time before fulfilling to create measurable time difference
    await chain.waitTillNextBlock(20); // 10 seconds

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name, orngOracle.name);

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);

    // Get adaptive config for calculation
    const adaptiveConfigTable = await orngContract.contract.table['adaptcfg'].get({
      scope: orngContract.name,
    });

    const emaHalfLifeSec = adaptiveConfigTable.rows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigTable.rows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsTableAfter.rows[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsTableBefore.rows[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).toBeGreaterThan(emaMinUpdateSec);

    // The paid_count_window should have incremented by 1 before EMA calculation
    const expectedPaidCount = rngstatsTableBefore.rows[0].paid_count_window + 1;

    // EMA should have been updated
    const expectedEMA = calculateEMA(0, expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsTableAfter.rows[0].paid_rate_ema_ch - expectedEMA)).toBeLessThan(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(0);
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(tx.processed.block_time.split('.')[0]);
  });

  it('should paid_rate_ema_ch increase', async () => {
    const rngstatsTableBefore = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    let tx;
    let numberOfAddingJob = 10;
    for(let i = 0; i < numberOfAddingJob; i++) {
      // Request random number (this will be a PAID call since credits = 0)
      const assocId = 2235 + i;
      const signingValue = 3345 + i;
      await orngContract.contract.action.requestrand(
        {
          assoc_id: assocId,
          signing_value: signingValue,
          caller: dapp1.name,
        },
        [
          {
            actor: dapp1.name,
            permission: 'active',
          },
        ]
      );

      // Get request ID
      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      let request = requestTable.rows[requestTable.rows.length - 1];

      if (i === numberOfAddingJob - 1) {
        // Wait more time before fulfilling to create measurable time difference
        await chain.waitTillNextBlock(22); // >10 seconds
      }

      // Submit random number from oracle
      tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name, orngOracle.name);
    }

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);

    // Get adaptive config for calculation
    const adaptiveConfigTable = await orngContract.contract.table['adaptcfg'].get({
      scope: orngContract.name,
    });

    const emaHalfLifeSec = adaptiveConfigTable.rows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigTable.rows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsTableAfter.rows[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsTableBefore.rows[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).toBeGreaterThan(emaMinUpdateSec);

    // The paid_count_window should have incremented by 10 before EMA calculation
    const expectedPaidCount = rngstatsTableBefore.rows[0].paid_count_window + numberOfAddingJob;

    // EMA should have been updated
    const expectedEMA = calculateEMA(parseFloat(rngstatsTableBefore.rows[0].paid_rate_ema_ch), expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsTableAfter.rows[0].paid_rate_ema_ch - expectedEMA)).toBeLessThan(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(0);
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(tx.processed.block_time.split('.')[0]);
    expect(parseFloat(rngstatsTableAfter.rows[0].paid_rate_ema_ch)).toBeGreaterThan(parseFloat(rngstatsTableBefore.rows[0].paid_rate_ema_ch));
  });

  it('should paid_rate_ema_ch decrease', async () => {
    const rngstatsTableBefore = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await dapp3.transfer(orngContract.name, '10.00000000 WAX', 'deposit-' + dapp3.name);

    let tx;
    let numberOfAddingJob = 2;
    for(let i = 0; i < numberOfAddingJob; i++) {
      // Request random number (this will be a PAID call since credits = 0)
      const assocId = 2235 + i;
      const signingValue = 3345 + i;
      await orngContract.contract.action.requestrand(
        {
          assoc_id: assocId,
          signing_value: signingValue,
          caller: dapp1.name,
        },
        [
          {
            actor: dapp1.name,
            permission: 'active',
          },
        ]
      );

      // Get request ID
      const requestTable = await orngContract.contract.table['reqs'].get({
        scope: orngContract.name,
      });
      let request = requestTable.rows[requestTable.rows.length - 1];

      if (i === numberOfAddingJob - 1) {
        // Wait more time before fulfilling to create measurable time difference
        await chain.waitTillNextBlock(60); // 30 seconds
      }

      // Submit random number from oracle
      tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name, orngOracle.name);
    }

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);

    // Get adaptive config for calculation
    const adaptiveConfigTable = await orngContract.contract.table['adaptcfg'].get({
      scope: orngContract.name,
    });

    const emaHalfLifeSec = adaptiveConfigTable.rows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigTable.rows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsTableAfter.rows[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsTableBefore.rows[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).toBeGreaterThan(emaMinUpdateSec);

    // The paid_count_window should have incremented by 10 before EMA calculation
    const expectedPaidCount = rngstatsTableBefore.rows[0].paid_count_window + numberOfAddingJob;

    // EMA should have been updated
    const expectedEMA = calculateEMA(parseFloat(rngstatsTableBefore.rows[0].paid_rate_ema_ch), expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsTableAfter.rows[0].paid_rate_ema_ch - expectedEMA)).toBeLessThan(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(0);
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(tx.processed.block_time.split('.')[0]);
    expect(parseFloat(rngstatsTableAfter.rows[0].paid_rate_ema_ch)).toBeLessThan(parseFloat(rngstatsTableBefore.rows[0].paid_rate_ema_ch));
  });

  it('should not paid rate if setrand failed', async () => {
    const rngstatsTableBefore = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 2335;
    const signingValue = 3445;
    let tx = await orngContract.contract.action.requestrand(
      {
        assoc_id: assocId,
        signing_value: signingValue,
        caller: dapp1.name,
      },
      [
        {
          actor: dapp1.name,
          permission: 'active',
        },
      ]
    );

    // Get request ID
    const requestTable = await orngContract.contract.table['reqs'].get({
      scope: orngContract.name,
    });
    let request = requestTable.rows[requestTable.rows.length - 1];

    // mismatch dapp then invalid signature
    await submitRandom(request.id, request.seed, request.nonce, 'fakedapp', orngOracle.name);

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);
    // data the same before since setrand with invalid signature will be silence exit
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(rngstatsTableBefore.rows[0].paid_count_window);
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(rngstatsTableBefore.rows[0].last_ema_update);
    expect(rngstatsTableAfter.rows[0].paid_rate_ema_ch).toBe(rngstatsTableBefore.rows[0].paid_rate_ema_ch);

    // setrand success with correct signature - update paid rate
    await submitRandom(request.id, request.seed, request.nonce, dapp1.name, orngOracle.name);

    // Get updated rngstats
    const rngstatsTableAfter1 = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter1.rows.length).toBe(1);
    // one more job added to window
    expect(rngstatsTableAfter1.rows[0].paid_count_window).toBe(rngstatsTableBefore.rows[0].paid_count_window + 1);
    expect(rngstatsTableAfter1.rows[0].last_ema_update).toBe(rngstatsTableBefore.rows[0].last_ema_update);
    expect(rngstatsTableAfter1.rows[0].paid_rate_ema_ch).toBe(rngstatsTableBefore.rows[0].paid_rate_ema_ch);

    // setrand with same job again, get error
    await expect(
      submitRandom(request.id, request.seed, request.nonce, dapp1.name, orngOracle.name)
    ).rejects.toThrowError('no request found');
    // Get updated rngstats
    const rngstatsTableAfter2 = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter2.rows.length).toBe(1);
    // data the same
    expect(rngstatsTableAfter2.rows[0].paid_count_window).toBe(rngstatsTableBefore.rows[0].paid_count_window + 1);
    expect(rngstatsTableAfter2.rows[0].last_ema_update).toBe(rngstatsTableBefore.rows[0].last_ema_update);
    expect(rngstatsTableAfter2.rows[0].paid_rate_ema_ch).toBe(rngstatsTableBefore.rows[0].paid_rate_ema_ch);
  });

  it('Should not update job count if job is free', async () => {
    const rngstatsTableBefore = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await dapp4.transfer(orngContract.name, '10.00000000 WAX', 'stake-' + dapp4.name);

    // Wait more time before fulfilling to create credits
    await chain.waitTillNextBlock(10); // 5 seconds

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.contract.action.requestrand(
      {
        assoc_id: assocId,
        signing_value: signingValue,
        caller: dapp4.name,
      },
      [
        {
          actor: dapp4.name,
          permission: 'active',
        },
      ]
    );

    // Get request ID
    const requestTable = await orngContract.contract.table['reqs'].get({
      scope: orngContract.name,
    });
    let request = requestTable.rows[requestTable.rows.length - 1];

    // Submit random number from oracle
    await submitRandom(request.id, request.seed, request.nonce, dapp1.name, orngOracle.name);

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);

    expect(rngstatsTableAfter.rows[0].paid_rate_ema_ch).toBe(rngstatsTableBefore.rows[0].paid_rate_ema_ch);
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(rngstatsTableBefore.rows[0].last_ema_update);
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(rngstatsTableBefore.rows[0].paid_count_window);
  });

  it('setrand for free job -should not update job count but paid_rate_ema_ch', async () => {
    const rngstatsTableBefore = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    // Stake WAX to get credits
    await dapp4.transfer(orngContract.name, '10.00000000 WAX', 'stake-' + dapp4.name);

    // Wait more time before fulfilling to create credits
    await chain.waitTillNextBlock(22); // >10 seconds

    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.contract.action.requestrand(
      {
        assoc_id: assocId,
        signing_value: signingValue,
        caller: dapp4.name,
      },
      [
        {
          actor: dapp4.name,
          permission: 'active',
        },
      ]
    );

    // Get request ID
    const requestTable = await orngContract.contract.table['reqs'].get({
      scope: orngContract.name,
    });
    let request = requestTable.rows[requestTable.rows.length - 1];

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp4.name, orngOracle.name);

    // Get updated rngstats
    const rngstatsTableAfter = await orngContract.contract.table['rngstats'].get({
      scope: orngContract.name,
    });

    expect(rngstatsTableAfter.rows.length).toBe(1);

    // Get adaptive config for calculation
    const adaptiveConfigTable = await orngContract.contract.table['adaptcfg'].get({
      scope: orngContract.name,
    });

    const emaHalfLifeSec = adaptiveConfigTable.rows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigTable.rows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsTableAfter.rows[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsTableBefore.rows[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).toBeGreaterThan(emaMinUpdateSec);

    // The paid_count_window is the same because request is free
    const expectedPaidCount = rngstatsTableBefore.rows[0].paid_count_window;

    // EMA should have been updated
    const expectedEMA = calculateEMA(parseFloat(rngstatsTableBefore.rows[0].paid_rate_ema_ch), expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsTableAfter.rows[0].paid_rate_ema_ch - expectedEMA)).toBeLessThan(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsTableAfter.rows[0].paid_count_window).toBe(0);
    expect(rngstatsTableAfter.rows[0].last_ema_update).toBe(tx.processed.block_time.split('.')[0]);
    expect(parseFloat(rngstatsTableAfter.rows[0].paid_rate_ema_ch)).toBeLessThan(parseFloat(rngstatsTableBefore.rows[0].paid_rate_ema_ch));
  });
});
