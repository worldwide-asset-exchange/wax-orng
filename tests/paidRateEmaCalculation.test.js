const vert = require('@waxio/vert');
const { Blockchain, nameToBigInt, expectToThrow, mintTokens } = vert;
const { assert, expect } = require('chai');

const crypto = require('crypto');
const fs = require('fs');
const { Name, Int64 } = require('@wharfkit/antelope');
const { RSASigning, make_msg } = require('./rsaSigning.js');

// Helper function to create time object for blockchain.addTime()
function seconds(s) {
  return {
    toMilliseconds: () => s * 1000
  };
}

// Helper: Get balance from eosio.token
function getBalance(tokenContract, accountName) {
  try {
    const rows = tokenContract.tables.accounts(nameToBigInt(accountName)).getTableRows();
    let row = rows.find(r => r.balance.includes('WAX'));
    if (row && row.balance) {
      return { amount: parseFloat(row.balance.split(' ')[0]) };
    }
  } catch (e) {
    // Account may not have balance row yet
  }
  return { amount: 0 };
}

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
  let blockchain;
  let systemContract = 'eosio';
  let orngContract;
  let orngOracle;
  let orngOracle2;
  let orngOracle3;
  let orngOracle4;
  let treasuryAccount;
  let eosioToken;

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

  before(async () => {
    blockchain = new Blockchain();
    blockchain.addTime(seconds(10)); // make sure the first timestamp is not zero

    // Create oracle accounts
    const oracleAccounts = blockchain.createAccounts('oracle.wax', 'oracle2.wax', 'oracle3.wax', 'oracle4.wax');
    orngOracle = oracleAccounts[0];
    orngOracle2 = oracleAccounts[1];
    orngOracle3 = oracleAccounts[2];
    orngOracle4 = oracleAccounts[3];

    // Create treasury account
    treasuryAccount = blockchain.createAccount('treasury');

    // Create test dapp accounts
    const dappAccounts = blockchain.createAccounts('dapp1', 'dapp2', 'dapp3', 'dapp4');
    dapp1 = dappAccounts[0];
    dapp2 = dappAccounts[1];
    dapp3 = dappAccounts[2];
    dapp4 = dappAccounts[3];

    // Create staker accounts
    const stakerAccounts = blockchain.createAccounts('staker1', 'staker2', 'staker3');
    staker1 = stakerAccounts[0];
    staker2 = stakerAccounts[1];
    staker3 = stakerAccounts[2];

    // Create eosio.token contract for token transfers
    eosioToken = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
      enableInline: true,
    });

    // Create ORNG contract account with contract
    orngContract = blockchain.createAccount({
      name: Name.from('orng.wax'),
      wasm: fs.readFileSync('./build/wax.orng.wasm'),
      abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
      enableInline: true,
    });

    // Initialize WAX token
    await mintTokens(
      eosioToken,
      'WAX',
      8,
      1000000000,
      10000,
      [treasuryAccount, dapp1, dapp2, dapp3, dapp4, staker1, staker2, staker3]
    );

    // Set up receiver contracts for dapps
    await dapp1.setContract({
      wasm: './tests/contracts/randreceiver.wasm',
      abi: './tests/contracts/randreceiver.abi',
    });

    // Initialize RSA public key
    await orngContract.actions.setpubkey([
      1,
      exponent0,
      modulus0
    ]).send('orng.wax@active');

    // Set up oracles
    await orngContract.actions.setoracles([
      [orngOracle.name.toString(), orngOracle2.name.toString()]
    ]).send('orng.wax@active');

    // Configure initial settings
    await orngContract.actions.configv2([
      '0.00500000 WAX',
      3
    ]).send('orng.wax@active');

    // Configure adaptive staking with default values
    await orngContract.actions.configadptive([
      18000,  // total_capacity_calls_per_hr
      900,    // free_min_calls_per_hr
      1800,   // headroom_calls_per_hr
      0,      // per_dapp_min_calls_per_hr
      100,    // burst_window_hours
      60,     // ema_half_life_sec
      10      // ema_min_update_sec
    ]).send('orng.wax@active');

    // Fund treasury
    await eosioToken.actions.transfer([
      treasuryAccount.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'treasury'
    ]).send(treasuryAccount.name.toString() + '@active');
  });

  after(async () => {
    // Cleanup if needed
  });

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
    return await orngContract.actions.setrand([
      oracle,
      id,
      1,
      sig
    ]).send(`${oracle}@active`);
  }

  it('should initialize rngstats with zero values', async () => {
    const rngstatsRows = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRows.length).to.equal(0);
  });

  it('First random job - only record job count ', async () => {
    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await eosioToken.actions.transfer([
      dapp1.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'deposit-' + dapp1.name.toString()
    ]).send(dapp1.name.toString() + '@active');

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp1.name.toString()
    ]).send('dapp1@active');

    // Get request ID
    const requestRows = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestRows[requestRows.length - 1];

    // Submit random number from oracle
    await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);

    expect(+rngstatsRowsAfter[0].paid_rate_ema_ch).to.equal(0);
    // last_ema_update should be set
    expect(rngstatsRowsAfter[0].last_ema_update).to.exist;
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(1);
  });

  it('Update job count if ema_min_update_sec has not been reached', async () => {
    const rngstatsRowsBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await eosioToken.actions.transfer([
      dapp2.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'deposit-' + dapp2.name.toString()
    ]).send(dapp2.name.toString() + '@active');

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp2.name.toString()
    ]).send('dapp2@active');

    // Get request ID
    const requestRows = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestRows[requestRows.length - 1];

    // Submit random number from oracle
    await submitRandom(request.id, request.seed, request.nonce, dapp2.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);

    expect(+rngstatsRowsAfter[0].paid_rate_ema_ch).to.equal(0);
    // last_ema_update stay the same
    expect(rngstatsRowsAfter[0].last_ema_update).to.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(2);
  });

  it('should paid rate ema after ema_min_update_sec', async () => {
    const rngstatsRowsBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await eosioToken.actions.transfer([
      dapp3.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'deposit-' + dapp3.name.toString()
    ]).send(dapp3.name.toString() + '@active');

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp1.name.toString()
    ]).send('dapp1@active');

    // Get request ID
    const requestRows = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestRows[requestRows.length - 1];

    // Wait more time before fulfilling to create measurable time difference
    blockchain.addTime(seconds(11)); // 11 seconds > ema_min_update_sec

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);

    // Get adaptive config for calculation
    const adaptiveConfigRows = orngContract.tables['adaptcfg'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    const emaHalfLifeSec = adaptiveConfigRows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigRows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsRowsAfter[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsRowsBefore[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).to.be.above(emaMinUpdateSec);

    // The paid_count_window should have incremented by 1 before EMA calculation
    const expectedPaidCount = rngstatsRowsBefore[0].paid_count_window + 1;

    // EMA should have been updated
    const expectedEMA = calculateEMA(0, expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsRowsAfter[0].paid_rate_ema_ch - expectedEMA)).to.be.below(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(0);
    // last_ema_update should be updated
    expect(rngstatsRowsAfter[0].last_ema_update).to.not.equal(rngstatsRowsBefore[0].last_ema_update);
  });

  it('should paid_rate_ema_ch increase', async () => {
    const rngstatsRowsBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    let tx;
    let numberOfAddingJob = 10;
    for(let i = 0; i < numberOfAddingJob; i++) {
      // Request random number (this will be a PAID call since credits = 0)
      const assocId = 2235 + i;
      const signingValue = 3345 + i;
      await orngContract.actions.requestrand([
        assocId,
        signingValue,
        dapp1.name.toString()
      ]).send('dapp1@active');

      // Get request ID
      const requestRows = orngContract.tables['reqs'](
        nameToBigInt('orng.wax')
      ).getTableRows();
      let request = requestRows[requestRows.length - 1];

      if (i === numberOfAddingJob - 1) {
        // Wait more time before fulfilling to create measurable time difference
        blockchain.addTime(seconds(11)); // >10 seconds
      }

      // Submit random number from oracle
      tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());
    }

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);

    // Get adaptive config for calculation
    const adaptiveConfigRows = orngContract.tables['adaptcfg'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    const emaHalfLifeSec = adaptiveConfigRows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigRows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsRowsAfter[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsRowsBefore[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).to.be.above(emaMinUpdateSec);

    // The paid_count_window should have incremented by 10 before EMA calculation
    const expectedPaidCount = rngstatsRowsBefore[0].paid_count_window + numberOfAddingJob;

    // EMA should have been updated
    const expectedEMA = calculateEMA(parseFloat(rngstatsRowsBefore[0].paid_rate_ema_ch), expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsRowsAfter[0].paid_rate_ema_ch - expectedEMA)).to.be.below(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(0);
    // last_ema_update should be updated
    expect(rngstatsRowsAfter[0].last_ema_update).to.not.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(parseFloat(rngstatsRowsAfter[0].paid_rate_ema_ch)).to.be.above(parseFloat(rngstatsRowsBefore[0].paid_rate_ema_ch));
  });

  it('should paid_rate_ema_ch decrease', async () => {
    const rngstatsRowsBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await eosioToken.actions.transfer([
      dapp3.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'deposit-' + dapp3.name.toString()
    ]).send(dapp3.name.toString() + '@active');

    let tx;
    let numberOfAddingJob = 2;
    for(let i = 0; i < numberOfAddingJob; i++) {
      // Request random number (this will be a PAID call since credits = 0)
      const assocId = 2235 + i;
      const signingValue = 3345 + i;
      await orngContract.actions.requestrand([
        assocId,
        signingValue,
        dapp1.name.toString()
      ]).send('dapp1@active');

      // Get request ID
      const requestRows = orngContract.tables['reqs'](
        nameToBigInt('orng.wax')
      ).getTableRows();
      let request = requestRows[requestRows.length - 1];

      if (i === numberOfAddingJob - 1) {
        // Wait more time before fulfilling to create measurable time difference
        blockchain.addTime(seconds(30)); // 30 seconds
      }

      // Submit random number from oracle
      tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());
    }

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);

    // Get adaptive config for calculation
    const adaptiveConfigRows = orngContract.tables['adaptcfg'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    const emaHalfLifeSec = adaptiveConfigRows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigRows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsRowsAfter[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsRowsBefore[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).to.be.above(emaMinUpdateSec);

    // The paid_count_window should have incremented by 10 before EMA calculation
    const expectedPaidCount = rngstatsRowsBefore[0].paid_count_window + numberOfAddingJob;

    // EMA should have been updated
    const expectedEMA = calculateEMA(parseFloat(rngstatsRowsBefore[0].paid_rate_ema_ch), expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsRowsAfter[0].paid_rate_ema_ch - expectedEMA)).to.be.below(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(0);
    // last_ema_update should be updated
    expect(rngstatsRowsAfter[0].last_ema_update).to.not.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(parseFloat(rngstatsRowsAfter[0].paid_rate_ema_ch)).to.be.below(parseFloat(rngstatsRowsBefore[0].paid_rate_ema_ch));
  });

  it('should not paid rate if setrand failed', async () => {
    const rngstatsRowsBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 2335;
    const signingValue = 3445;
    let tx = await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp1.name.toString()
    ]).send('dapp1@active');

    // Get request ID
    const requestRows = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestRows[requestRows.length - 1];

    // mismatch dapp then invalid signature
    await submitRandom(request.id, request.seed, request.nonce, 'fakedapp', orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);
    // data the same before since setrand with invalid signature will be silence exit
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(rngstatsRowsBefore[0].paid_count_window);
    expect(rngstatsRowsAfter[0].last_ema_update).to.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(rngstatsRowsAfter[0].paid_rate_ema_ch).to.equal(rngstatsRowsBefore[0].paid_rate_ema_ch);

    // setrand success with correct signature - update paid rate
    await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsRowsAfter1 = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter1.length).to.equal(1);
    // one more job added to window
    expect(rngstatsRowsAfter1[0].paid_count_window).to.equal(rngstatsRowsBefore[0].paid_count_window + 1);
    expect(rngstatsRowsAfter1[0].last_ema_update).to.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(rngstatsRowsAfter1[0].paid_rate_ema_ch).to.equal(rngstatsRowsBefore[0].paid_rate_ema_ch);

    // setrand with same job again, get error
    await expectToThrow(
      submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString()),
      'eosio_assert: no request found'
    );
    // Get updated rngstats
    const rngstatsRowsAfter2 = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter2.length).to.equal(1);
    // data the same
    expect(rngstatsRowsAfter2[0].paid_count_window).to.equal(rngstatsRowsBefore[0].paid_count_window + 1);
    expect(rngstatsRowsAfter2[0].last_ema_update).to.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(rngstatsRowsAfter2[0].paid_rate_ema_ch).to.equal(rngstatsRowsBefore[0].paid_rate_ema_ch);
  });

  it('Should not update job count if job is free', async () => {
    const rngstatsRowsBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await eosioToken.actions.transfer([
      dapp4.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'stake-' + dapp4.name.toString()
    ]).send(dapp4.name.toString() + '@active');

    // Wait more time before fulfilling to create credits
    blockchain.addTime(seconds(5)); // 5 seconds

    // Request random number (this will be a PAID call since credits = 0)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp4.name.toString()
    ]).send('dapp4@active');

    // Get request ID
    const requestRows = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestRows[requestRows.length - 1];

    // Submit random number from oracle
    await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);

    expect(rngstatsRowsAfter[0].paid_rate_ema_ch).to.equal(rngstatsRowsBefore[0].paid_rate_ema_ch);
    expect(rngstatsRowsAfter[0].last_ema_update).to.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(rngstatsRowsBefore[0].paid_count_window);
  });

  it('setrand for free job -should not update job count but paid_rate_ema_ch', async () => {
    const rngstatsRowsBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Stake WAX to get credits
    await eosioToken.actions.transfer([
      dapp4.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'stake-' + dapp4.name.toString()
    ]).send(dapp4.name.toString() + '@active');

    // Wait more time before fulfilling to create credits
    blockchain.addTime(seconds(11)); // >10 seconds

    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp4.name.toString()
    ]).send('dapp4@active');

    // Get request ID
    const requestRows = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestRows[requestRows.length - 1];

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp4.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsRowsAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsRowsAfter.length).to.equal(1);

    // Get adaptive config for calculation
    const adaptiveConfigRows = orngContract.tables['adaptcfg'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    const emaHalfLifeSec = adaptiveConfigRows[0].ema_half_life_sec;
    const emaMinUpdateSec = adaptiveConfigRows[0].ema_min_update_sec;

    // Calculate time difference
    const lastUpdateAfter = new Date(rngstatsRowsAfter[0].last_ema_update);
    const lastUpdateBefore = new Date(rngstatsRowsBefore[0].last_ema_update);
    const dt = Math.floor((lastUpdateAfter - lastUpdateBefore) / 1000);
    expect(dt).to.be.above(emaMinUpdateSec);

    // The paid_count_window is the same because request is free
    const expectedPaidCount = rngstatsRowsBefore[0].paid_count_window;

    // EMA should have been updated
    const expectedEMA = calculateEMA(parseFloat(rngstatsRowsBefore[0].paid_rate_ema_ch), expectedPaidCount, dt, emaHalfLifeSec);

    // Allow small floating point tolerance
    expect(Math.abs(rngstatsRowsAfter[0].paid_rate_ema_ch - expectedEMA)).to.be.below(0.01);

    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsRowsAfter[0].paid_count_window).to.equal(0);
    // last_ema_update should be updated
    expect(rngstatsRowsAfter[0].last_ema_update).to.not.equal(rngstatsRowsBefore[0].last_ema_update);
    expect(parseFloat(rngstatsRowsAfter[0].paid_rate_ema_ch)).to.be.below(parseFloat(rngstatsRowsBefore[0].paid_rate_ema_ch));
  });
});
