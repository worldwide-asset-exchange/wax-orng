const vert = require('@waxio/vert');
const { Blockchain, nameToBigInt, expectToThrow, mintTokens } = vert;
const { assert, expect } = require('chai');
const crypto = require('crypto');
const fs = require('fs');
const { RSASigning, make_msg } = require('./rsaSigning.js');
const { Name, Int64, TimePoint } = require("@wharfkit/antelope")

function stringHashToNum(str) {
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    let bytes = str.slice(i * 2, i * 2 + 2);
    const a = parseInt(bytes, 16) & 127;
    result = (result << BigInt(8)) + BigInt(a);
  }
  return result.toString();
}

// Helper function to create time object for blockchain.addTime()
function seconds(s) {
  return {
    toMilliseconds: () => s * 1000
  };
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function getActivePermission(actors) {
  const permissions = [];
  for (const actor of actors) {
    let permission = {
      actor,
      permission: 'active',
    };
    permissions.push(permission);
  }
  return permissions;
}

// Price calculation constants from Delphi oracle setup
const WAX_USD_PRICE = 3067;  // $0.3067 per WAX (median from Delphi datapoints)
const QUOTED_PRECISION = 4;
const BASE_PRECISION = 10000;
const SECONDS_PER_MONTH = 30 * 24 * 3600;  // 2,592,000 seconds

// Helper: Calculate expected stipend accrual
function calculateStipendAccrual(seconds, monthlyStipend) {
  return Math.floor((seconds * monthlyStipend) / SECONDS_PER_MONTH);
}

// Helper: Convert USD (BASE_PRECISION) to WAX (8 decimals)
function usdToWaxAmount(usd, price) {
  // usd and price are both in BASE_PRECISION (10^4)
  // Result should be in WAX's smallest unit (8 decimals)
  return Math.floor((usd * 100000000) / price);
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

describe('Oracle Stipend System Tests', () => {
  let blockchain;
  let tokenContract;
  let systemContract = 'eosio';
  let orngContract;
  let govAccount;
  let orngOracle;
  let orngOracle2;
  let orngOracle3;
  let delphiAccount;
  let treasuryAccount;

  const exponent0 = '10001';
  const modulus0 =
    'c61c159689a0bddad3b3855e29f996c91d358f8735d653272565957f9b184f4312b6fe1604adacbcbc9af99a8a9cebfeabd3e93fff3b1e5c7e7a95567e1671dd2b09e868dc54763cd3ecac29d0cb1bcf2a5b4ad39455f273a0d91c4adba1ddf8a79e49f9ca48b6c3f8a2280702317c213548d0ee24c2ec2a0fb8ff31196601cb988316dd0bb7830f8702a216e8369167c0a7a22336232a2291a26f1f2811a2ed81e02da627e07315c89ae376f3a7112b73c8661ab64411c99cdc80b77ce373edfd5e17a44a737e4321db373bcf87091ad02a64a09be58b7ad4d8610b58b018bc6c5136150746f2b7d0a83f2832caaafb2b9f30b5e978fe27974d36d2e9334b0eb7c739bda9e212e413ab8b05f4f42ab2d0447b2b152ae02901a3c755bc44ae494f3ee094643c6cc44f0e5a1d7e4220abb62ee595576e94c27e299fe7cb0568b11d638b7a4a8f332c626d704f3d38bf3ae7c2c9f265bac26611df6a7988b15bc8d743bac8f98d6de8fc68d3b6a46a563ffff4f3b58f90fea9fc96223bcf022083562fa69c810641f8d9d4e6ed9e4cfad24f2424d5cbaef058d8fbbd2b44ce59b5f1f2a5ca89f4c0801da6c816611fc6131e9741471bb49bdec6a78ab0559fa4b324f538ad34a0c1ac74a8fee99a7f73b0564312f3473ccd78354b15211d8d8136c31dd2ab1a566c95bcbf2c6e1c1870cb79562e9a9d5e7cabf96e45f37ac3e9c1';
  const privateKey0 = fs.readFileSync('./tests/resources/test_rsa_4096_priv_0.pem', 'utf8');

  function getRSAPrivateKey(version) {
    if (version == 1) {
      return privateKey0;
    }
  }

  async function initDelphioracle(delphiAccount) {
    console.log('delphioracle init', delphiAccount.name.toString());

    let now = new Date();
    let nowString = now.toISOString().replace('Z', '');
    console.log('nowString', nowString);

    // Create the waxpusd pair in the pairs table
    delphiAccount.tables.pairs(nameToBigInt('delphioracle')).set(
      nameToBigInt('waxpusd'),
      delphiAccount.name,
      {
        active: true,
        bounty_awarded: false,
        bounty_edited_by_custodians: false,
        proposer: delphiAccount.name.toString(),
        name: 'waxpusd',
        bounty_amount: '0.0000 WAX',
        approving_custodians: [],
        approving_oracles: [],
        base_symbol: '8,WAXP',
        base_type: 4,
        base_contract: '',
        quote_symbol: '4,USD',
        quote_type: 1,
        quote_contract: '',
        quoted_precision: 4,
        timestamp: nowString
      }
    );

    const datapoints = [
      {
        id: 21,
        owner: "pink.gg",
        value: 3090,
        median: 3064,
        timestamp: nowString,
      },
      {
        id: 22,
        owner: "wizardsguild",
        value: 3075,
        median: 3075,
        timestamp: nowString,
      },
      {
        id: 23,
        owner: "wax.eastern",
        value: 3068,
        median: 3075,
        timestamp: nowString,
      },
      {
        id: 24,
        owner: "alohaeosprod",
        value: 3075,
        median: 3075,
        timestamp: nowString,
      },
      {
        id: 25,
        owner: "ivote4waxusa",
        value: 3134,
        median: 3075,
        timestamp: nowString,
      },
      {
        id: 26,
        owner: "eosphereiobp",
        value: 3067,
        median: 3075,
        timestamp: nowString,
      },
      {
        id: 27,
        owner: "eosdublinwow",
        value: 3128,
        median: 3075,
        timestamp: nowString,
      },
      {
        id: 28,
        owner: "bountyblokbp",
        value: 3067,
        median: 3066,
        timestamp: nowString,
      },
      {
        id: 29,
        owner: "blocksmithio",
        value: 3065,
        median: 3066,
        timestamp: nowString,
      },
      {
        id: 30,
        owner: "liquidstudio",
        value: 3075,
        median: 3067,
        timestamp: nowString,
      },
    ];

    // Add all datapoints to the table
    for (const datapoint of datapoints) {
      delphiAccount.tables.datapoints(nameToBigInt('waxpusd')).set(
        BigInt(datapoint.id),
        delphiAccount.name,
        datapoint
      );
    }
  }

  before(async () => {
    blockchain = new Blockchain();

    // Deploy eosio.token contract
    tokenContract = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
    });
    
    // Create regular accounts first
    const accounts = blockchain.createAccounts(
      'oracle.wax',
      'oracle2.wax',
      'oracle3.wax',
      'treasury1'
    );

    orngOracle = accounts[0];
    orngOracle2 = accounts[1];
    orngOracle3 = accounts[2];
    treasuryAccount = accounts[3];

    // Deploy orng contract with wasm/abi
    orngContract = blockchain.createAccount({
      name: Name.from('orng.wax'),
      wasm: fs.readFileSync('./build/wax.orng.wasm'),
      abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
      enableInline: true,
    });
    govAccount = orngContract;

    // Deploy delphioracle contract with wasm/abi
    delphiAccount = blockchain.createAccount({
      name: Name.from('delphioracle'),
      wasm: fs.readFileSync('./tests/contracts/delphioracle.wasm'),
      abi: fs.readFileSync('./tests/contracts/delphioracle.abi', 'utf8'),
    });

    // Issue tokens to accounts
    const accountsToFund = [
      orngOracle,
      orngOracle2,
      orngOracle3,
      treasuryAccount
    ];

    await mintTokens(tokenContract, 'WAX', 8, 1000000000, 10000, accountsToFund);


    await initDelphioracle(delphiAccount);

    await orngContract.actions.setpubkey([
      1,
      exponent0,
      modulus0
    ]).send('orng.wax@active');

    await orngContract.actions.setoracles([
      [orngOracle.name.toString(), orngOracle2.name.toString(), orngOracle3.name.toString()]
    ]).send('orng.wax@active');

    // Initial v2 config
    await orngContract.actions.configv2([
      '0.00500000 WAX',
      3
    ]).send('orng.wax@active');

    // Fund treasury
    await tokenContract.actions.transfer([
      treasuryAccount.name.toString(),
      orngContract.name.toString(),
      '1000.00000000 WAX',
      'treasury'
    ]).send('treasury1@active');
  });

  after(async () => {
    // Cleanup if needed
  });

  describe('configv3 Action Tests', () => {
    it('should set configv3 with all parameters', async () => {
      await orngContract.actions.configv3([
        1000000, // $100/month in BASE_PRECISION
        86400    // 24 hours
      ]).send('orng.wax@active');

      // Verify stipendmonth
      const stipendConfig = orngContract.tables['config.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt('stipendmonth'));
      expect(stipendConfig.value).to.equal(1000000);

      // Verify minclaimint
      const minClaimConfig = orngContract.tables['config.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt('minclaimint'));
      expect(minClaimConfig.value).to.equal(86400);
    });

    it('should require contract auth for configv3', async () => {
      await expectToThrow(
        orngContract.actions.configv3([
          500000,
          43200
        ]).send('oracle.wax@active'),
        'missing required authority orng.wax'
      );
    });

    it('should update existing config values', async () => {
      // Set initial
      await orngContract.actions.configv3([
        2000000,
        3600
      ]).send('orng.wax@active');

      // Update
      await orngContract.actions.configv3([
        1500000,
        7200
      ]).send('orng.wax@active');

      // Verify updates
      const stipendConfig = orngContract.tables['config.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt('stipendmonth'));
      expect(stipendConfig.value).to.equal(1500000);
    });
  });

  describe('Oracle Stipend Initialization Tests', () => {
    it('should auto-initialize ostip table when setting oracles', async () => {
      // ostip table should already be initialized from before
      const oracle1 = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle.name.toString()));

      expect(oracle1).to.exist;
      expect(oracle1.active).to.be.true;
      expect(Number(oracle1.usd_accrued)).to.equal(0);
      expect(oracle1.last_claim).to.exist;
      expect(oracle1.last_accrue).to.exist;
    });

    it('should preserve existing stipend data when re-setting oracles', async () => {
      // Set stipend config
      await orngContract.actions.configv3([
        1000000,
        10
      ]).send('orng.wax@active');

      // Wait to accrue some stipend
      blockchain.addTime(seconds(30)); // 30 seconds

      // Trigger accrual
      await orngContract.actions.setstipend([
        orngOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Get current accrued amount
      const ostipBefore = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle.name.toString()));
      const accruedBefore = Number(ostipBefore.usd_accrued);

      // Re-set oracles (same list)
      await orngContract.actions.setoracles([
        [orngOracle.name.toString(), orngOracle2.name.toString(), orngOracle3.name.toString()]
      ]).send('orng.wax@active');

      // Check stipend is preserved
      const ostipAfter = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle.name.toString()));

      // Should still have the accrued amount
      expect(Number(ostipAfter.usd_accrued)).to.be.at.least(accruedBefore);
    });
  });

  describe('Stipend Accrual Tests', () => {
    before(async () => {
      // Configure stipend system
      await orngContract.actions.configv3([
        1000000, // $100/month
        10       // 10 seconds for faster testing
      ]).send('orng.wax@active');
    });

    it('should call setstipend without error (triggers accrual)', async () => {
      // This test verifies that setstipend executes successfully
      // Even though time hasn't passed, it tests the accrual code path
      await orngContract.actions.setstipend([
        orngOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Verify table state is accessible
      const ostip = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle.name.toString()));

      expect(ostip).to.exist;
      expect(ostip.active).to.be.true;
    });

    it('should NOT accrue when oracle is inactive', async () => {
      // Set oracle inactive
      await orngContract.actions.setstipend([
        orngOracle2.name.toString(),
        false
      ]).send('orng.wax@active');

      // Get initial state
      const ostipBefore = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle2.name.toString()));
      const accruedBefore = Number(ostipBefore.usd_accrued);

      // Wait 30 seconds
      blockchain.addTime(seconds(30));

      // Try to trigger accrual (shouldn't accrue since inactive)
      await orngContract.actions.setstipend([
        orngOracle2.name.toString(),
        false
      ]).send('orng.wax@active');

      // Check no accrual
      const ostipAfter = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle2.name.toString()));
      expect(Number(ostipAfter.usd_accrued)).to.equal(accruedBefore);
    });

    it('should accrue stipend when oracle reactivated', async () => {
      // Start with oracle2 inactive from previous test
      const ostipBefore = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle2.name.toString()));

      await orngContract.actions.setstipend([
        orngOracle2.name.toString(),
        true
      ]).send('orng.wax@active');

      const accruedBefore = Number(ostipBefore.usd_accrued);

      // Wait and accrue
      blockchain.addTime(seconds(30));

      // Trigger accrual
      await orngContract.actions.setstipend([
        orngOracle2.name.toString(),
        true
      ]).send('orng.wax@active');

      // Should have accrued
      const ostipAfter = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle2.name.toString()));
      expect(Number(ostipAfter.usd_accrued)).to.be.above(accruedBefore);
    });
  });

  describe('Claim Action with Stipend Tests', () => {
    let testOracle;

    before(async () => {
      const newAccounts = blockchain.createAccounts('testoracle1');
      testOracle = newAccounts[0];

      // Transfer tokens to testOracle from treasury
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        testOracle.name.toString(),
        '100.00000000 WAX',
        'initial'
      ]).send('treasury1@active');

      // Add testOracle to oracle list
      await orngContract.actions.setoracles([
        [orngOracle.name.toString(), orngOracle2.name.toString(), orngOracle3.name.toString(), testOracle.name.toString()]
      ]).send('orng.wax@active');

      // Configure stipend
      await orngContract.actions.configv3([
        2592000, // $259.20/month = $0.01/second for easy calculation
        10
      ]).send('orng.wax@active');

      // Ensure treasury has funds
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        orngContract.name.toString(),
        '500.00000000 WAX',
        'treasury'
      ]).send('treasury1@active');
    });

    it('should claim stipend only (no per-call fees)', async () => {
      // Wait 100 seconds to accrue stipend
      blockchain.addTime(seconds(100));

      // Trigger accrual before claiming
      await orngContract.actions.setstipend([
        testOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Get oracle balance before
      const balanceBefore = getBalance(tokenContract, testOracle.name.toString());

      // Expected: 100 seconds * 2592000 / (30*24*3600) = 100 USD in BASE_PRECISION
      const expectedUsd = calculateStipendAccrual(100, 2592000);
      // Convert to WAX: 100 * 10000 / 3067 ≈ 326.02 WAX
      const expectedWax = usdToWaxAmount(expectedUsd, WAX_USD_PRICE);

      // Claim
      await orngContract.actions.claim([
        testOracle.name.toString()
      ]).send('testoracle1@active');

      // Check balance increased
      const balanceAfter = getBalance(tokenContract, testOracle.name.toString());
      const received = balanceAfter.amount - balanceBefore.amount;

      // Allow 1 WAX tolerance for rounding
      expect(received).to.be.at.least(Math.floor(expectedWax / 100000000) - 1);
      expect(received).to.be.at.most(Math.floor(expectedWax / 100000000) + 1);

      // Check ostip table updated
      const ostipAfter = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(testOracle.name.toString()));

      // usd_accrued should be 0 or very small residual
      expect(Number(ostipAfter.usd_accrued)).to.be.below(100);
    });

    it('should enforce minimum claim interval', async () => {
      // Try to claim immediately after previous claim
      await expectToThrow(
        orngContract.actions.claim([
          testOracle.name.toString()
        ]).send('testoracle1@active'),
        'eosio_assert: too soon'
      );
    });

    it('should allow claim after interval passes', async () => {
      // Wait for min interval (10 seconds)
      blockchain.addTime(seconds(10));

      // Trigger accrual
      await orngContract.actions.setstipend([
        testOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Should work now
      await orngContract.actions.claim([
        testOracle.name.toString()
      ]).send('testoracle1@active');
    });

    it('should claim both stipend bonus and oracle work reward', async () => {
      // Create a new test oracle for this test
      const newAccounts = blockchain.createAccounts('workoracle1');
      const workOracle = newAccounts[0];

      // Transfer tokens to workOracle from treasury
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        workOracle.name.toString(),
        '100.00000000 WAX',
        'initial'
      ]).send('treasury1@active');

      // Add workOracle to oracle list
      await orngContract.actions.setoracles([
        [orngOracle.name.toString(), orngOracle2.name.toString(), orngOracle3.name.toString(), workOracle.name.toString()]
      ]).send('orng.wax@active');

      // Configure stipend
      await orngContract.actions.configv3([
        2592000, // $259.20/month = $0.01/second for easy calculation
        10
      ]).send('orng.wax@active');

      // Ensure treasury has funds
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        orngContract.name.toString(),
        '500.00000000 WAX',
        'treasury'
      ]).send('treasury1@active');

      // Wait 30 seconds to accrue stipend
      blockchain.addTime(seconds(30));

      // Trigger accrual before work
      await orngContract.actions.setstipend([
        workOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Now oracle does work: process a random number request
      // First, register a dapp and stake
      const dappAccounts = blockchain.createAccounts('testdapp1');
      const testDapp = dappAccounts[0];

      // Transfer tokens to testDapp from treasury
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        testDapp.name.toString(),
        '100.00000000 WAX',
        'initial'
      ]).send('treasury1@active');

      await tokenContract.actions.transfer([
        testDapp.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        `stake-${testDapp.name.toString()}`
      ]).send('testdapp1@active');

      // Also deposit for fee payments
      await tokenContract.actions.transfer([
        testDapp.name.toString(),
        orngContract.name.toString(),
        '1.00000000 WAX',
        `deposit-${testDapp.name.toString()}`
      ]).send('testdapp1@active');

      // Request random number (this will create work for oracles)
      await orngContract.actions.requestrand([
        12345,
        999999,
        testDapp.name.toString()
      ]).send('testdapp1@active');

      // Get request ID from table
      const req = orngContract.tables.reqs(nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt('0'));

      expect(req).to.exist;
      const requestId = req.id;

      // Oracle completes the work to earn reward
      const rsaSigning = new RSASigning(getRSAPrivateKey(1));
      const msg = make_msg(req.seed, testDapp.name.toString(), req.nonce);
      const signature = rsaSigning.generateRandomNumber(msg);

      await orngContract.actions.setrand([
        workOracle.name.toString(),
        requestId,
        1,
        signature
      ]).send('workoracle1@active');

      // Get oracle balance before claim
      const balanceBefore = getBalance(tokenContract, workOracle.name.toString());

      // Get balance table before claim to check work reward
      let expectedWorkRewardWax = 0;
      try {
        const balanceRow = orngContract.tables.balances(nameToBigInt('orng.wax'))
          .getTableRow(nameToBigInt(workOracle.name.toString()));

        if (balanceRow && balanceRow.unpaid) {
          const unpaidStr = balanceRow.unpaid;
          expectedWorkRewardWax = parseFloat(unpaidStr.split(' ')[0]);
        }
      } catch (e) {
        // No balance row yet
      }

      // Expected stipend: 30 seconds * 2592000 / (30*24*3600) = 30 USD in BASE_PRECISION
      const expectedStipendUsd = calculateStipendAccrual(30, 2592000);
      const expectedStipendWax = usdToWaxAmount(expectedStipendUsd, WAX_USD_PRICE);
      const expectedStipendWaxFloat = expectedStipendWax / 100000000; // Convert to WAX units

      // Claim both stipend and work reward
      await orngContract.actions.claim([
        workOracle.name.toString()
      ]).send('workoracle1@active');

      // Check balance increased
      const balanceAfter = getBalance(tokenContract, workOracle.name.toString());
      const receivedWax = balanceAfter.amount - balanceBefore.amount;

      // Expected total = work reward + stipend (both in WAX float)
      const expectedTotalWax = expectedWorkRewardWax + expectedStipendWaxFloat;

      // Allow tolerance for rounding
      expect(receivedWax).to.be.at.least(expectedTotalWax - 0.01); // 0.01 WAX tolerance
      expect(receivedWax).to.be.at.most(expectedTotalWax + 0.01);

      // Verify work reward was cleared (or reduced to 0)
      try {
        const balancesAfter = orngContract.tables.balances(nameToBigInt('orng.wax'))
          .getTableRow(nameToBigInt(workOracle.name.toString()));

        // Balance entry may still exist but unpaid should be 0
        if (balancesAfter) {
          expect(balancesAfter.unpaid).to.equal('0.00000000 WAX');
        }
      } catch (e) {
        // Row was deleted, which is fine
      }

      // Verify stipend was mostly cleared (may have small residual)
      const ostipAfter = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(workOracle.name.toString()));
      expect(Number(ostipAfter.usd_accrued)).to.be.below(100);
    });
  });

  describe('setstipend Action Tests', () => {
    it('should manually set oracle active status', async () => {
      // Set inactive
      await orngContract.actions.setstipend([
        orngOracle3.name.toString(),
        false
      ]).send('orng.wax@active');

      const ostip1 = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle3.name.toString()));
      expect(ostip1.active).to.be.false;

      // Set active again
      await orngContract.actions.setstipend([
        orngOracle3.name.toString(),
        true
      ]).send('orng.wax@active');

      const ostip2 = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle3.name.toString()));
      expect(ostip2.active).to.be.true;
    });

    it('should require contract auth for setstipend', async () => {
      await expectToThrow(
        orngContract.actions.setstipend([
          orngOracle.name.toString(),
          false
        ]).send('oracle.wax@active'),
        'missing required authority orng.wax'
      );
    });

    it('should preserve usd_accrued when toggling active', async () => {
      // Configure and accrue
      await orngContract.actions.configv3([
        1000000,
        10
      ]).send('orng.wax@active');

      // Ensure active
      await orngContract.actions.setstipend([
        orngOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Wait to accrue
      blockchain.addTime(seconds(30));

      // Trigger accrual
      try {
        await orngContract.actions.claim([
          orngOracle.name.toString()
        ]).send('oracle.wax@active');
      } catch (e) {
        // May fail due to timing, but will accrue
      }

      // Get accrued amount
      const ostipBefore = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle.name.toString()));
      const accruedBefore = Number(ostipBefore.usd_accrued);

      // Toggle inactive then active
      await orngContract.actions.setstipend([
        orngOracle.name.toString(),
        false
      ]).send('orng.wax@active');

      await orngContract.actions.setstipend([
        orngOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Check preserved
      const ostipAfter = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(orngOracle.name.toString()));
      expect(Number(ostipAfter.usd_accrued)).to.be.at.least(accruedBefore);
    });
  });

  describe('Integration: Claim Throttling Tests', () => {
    let throttleOracle;

    before(async () => {
      const newAccounts = blockchain.createAccounts('throttle1');
      throttleOracle = newAccounts[0];

      // Transfer tokens to throttleOracle from treasury
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        throttleOracle.name.toString(),
        '100.00000000 WAX',
        'initial'
      ]).send('treasury1@active');

      await orngContract.actions.setoracles([
        [orngOracle.name.toString(), orngOracle2.name.toString(), orngOracle3.name.toString(), throttleOracle.name.toString()]
      ]).send('orng.wax@active');

      await orngContract.actions.configv3([
        2592000,
        60 // 1 minute
      ]).send('orng.wax@active');
    });

    it('should calculate time correctly across multiple claims', async () => {
      // Wait and claim at T=0
      blockchain.addTime(seconds(60));

      // Trigger accrual before first claim
      await orngContract.actions.setstipend([
        throttleOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      await orngContract.actions.claim([
        throttleOracle.name.toString()
      ]).send('throttle1@active');

      const ostip1 = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(throttleOracle.name.toString()));
      const claim1Time = ostip1.last_claim;

      // Wait 60+ seconds and claim at T=60
      blockchain.addTime(seconds(60));

      // Trigger accrual before second claim
      await orngContract.actions.setstipend([
        throttleOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      await orngContract.actions.claim([
        throttleOracle.name.toString()
      ]).send('throttle1@active');

      const ostip2 = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(throttleOracle.name.toString()));
      const claim2Time = ostip2.last_claim;

      // Verify time advanced
      expect(new Date(claim2Time).getTime()).to.be.above(new Date(claim1Time).getTime());
    });
  });

  describe('Suspended Oracle Stipend Behavior Tests', () => {
    let suspendOracle;
    let suspendDapp;

    before(async () => {
      // Create test oracle and dapp for suspension tests
      const newAccounts = blockchain.createAccounts('suspendtest', 'suspenddapp');
      suspendOracle = newAccounts[0];
      suspendDapp = newAccounts[1];

      // Transfer tokens to suspendOracle and suspendDapp from treasury
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        suspendOracle.name.toString(),
        '100.00000000 WAX',
        'initial'
      ]).send('treasury1@active');

      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        suspendDapp.name.toString(),
        '100.00000000 WAX',
        'initial'
      ]).send('treasury1@active');

      // Add suspendOracle to oracle list
      await orngContract.actions.setoracles([
        [orngOracle.name.toString(), orngOracle2.name.toString(), orngOracle3.name.toString(), suspendOracle.name.toString()]
      ]).send('orng.wax@active');

      // Configure stipend: 2592000 = $259.20/month = $0.01/second for easy calculation
      await orngContract.actions.configv3([
        2592000,
        10 // 10 seconds minimum claim interval
      ]).send('orng.wax@active');

      // Ensure treasury has funds
      await tokenContract.actions.transfer([
        treasuryAccount.name.toString(),
        orngContract.name.toString(),
        '500.00000000 WAX',
        'treasury'
      ]).send('treasury1@active');

      // Setup dapp with stake for random number requests
      await tokenContract.actions.transfer([
        suspendDapp.name.toString(),
        orngContract.name.toString(),
        '10.00000000 WAX',
        `stake-${suspendDapp.name.toString()}`
      ]).send('suspenddapp@active');
    });

    it('should NOT accrue stipend while oracle is suspended', async () => {
      // Ensure oracle starts clean (not suspended)
      await orngContract.actions.resetsuspen([
        suspendOracle.name.toString()
      ]).send('orng.wax@active');

      // Wait 30 seconds and trigger accrual to establish baseline
      blockchain.addTime(seconds(30));
      await orngContract.actions.setstipend([
        suspendOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Get baseline accrued amount
      const ostipBefore = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      const accruedBeforeSuspension = Number(ostipBefore.usd_accrued);

      // Expected: 30 seconds * 2592000 / (30*24*3600) = 30 USD (300000 in BASE_PRECISION)
      const expectedBaseline = calculateStipendAccrual(30, 2592000);
      expect(accruedBeforeSuspension).to.be.at.least(expectedBaseline - 100);
      expect(accruedBeforeSuspension).to.be.at.most(expectedBaseline + 100);

      // Create a request to generate strikes
      const assoc_id = 777;
      await orngContract.actions.requestrand([
        assoc_id,
        12345,
        suspendDapp.name.toString()
      ]).send('suspenddapp@active');

      // Get the request
      const requestTable_rows = orngContract.tables['reqs'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const lastRequest = requestTable_rows[requestTable_rows.length - 1];

      // Give oracle 3 strikes by providing invalid signatures
      // Strike 1
      await orngContract.actions.setrand([
        suspendOracle.name.toString(),
        lastRequest.id,
        lastRequest.ver,
        'invalid_signature_1',
      ]).send('suspendtest@active');

      // Strike 2
      await orngContract.actions.setrand([
        suspendOracle.name.toString(),
        lastRequest.id,
        lastRequest.ver,
        'invalid_signature_2',
      ]).send('suspendtest@active');

      // Strike 3 - this should suspend the oracle
      await orngContract.actions.setrand([
        suspendOracle.name.toString(),
        lastRequest.id,
        lastRequest.ver,
        'invalid_signature_3',
      ]).send('suspendtest@active');

      // Verify oracle is suspended
      const oraclesTableAfterSuspension = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const suspendedOracle = oraclesTableAfterSuspension.find(r => r.oracle === suspendOracle.name.toString());
      expect(suspendedOracle.suspended).to.equal(true);
      expect(suspendedOracle.strikes).to.equal(3);

      // Verify stipend is inactive
      const ostipAfterSuspension = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      expect(ostipAfterSuspension.active).to.be.false;

      // Record accrued amount right after suspension
      const accruedAtSuspension = Number(ostipAfterSuspension.usd_accrued);

      // Wait 60 seconds while suspended
      blockchain.addTime(seconds(60));

      // Try to trigger accrual (should not accrue since inactive)
      await orngContract.actions.setstipend([
        suspendOracle.name.toString(),
        false // Keep it inactive
      ]).send('orng.wax@active');

      // Check that no accrual happened during suspension
      const ostipDuringSuspension = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      const accruedDuringSuspension = Number(ostipDuringSuspension.usd_accrued);

      // Should be the same as at suspension time (no accrual)
      expect(accruedDuringSuspension).to.equal(accruedAtSuspension);
    });

    it('should NOT receive retroactive stipend after reactivation', async () => {
      // Oracle should still be suspended from previous test
      const oraclesTableBefore = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const suspendedOracle = oraclesTableBefore.find(r => r.oracle === suspendOracle.name.toString());
      expect(suspendedOracle.suspended).to.equal(true);

      // Record accrued amount before reactivation
      const ostipBeforeReactivation = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      const accruedBeforeReactivation = Number(ostipBeforeReactivation.usd_accrued);

      // Reactivate the oracle
      await orngContract.actions.resetsuspen([
        suspendOracle.name.toString()
      ]).send('orng.wax@active');

      // Verify oracle is no longer suspended
      const oraclesTableAfterReset = orngContract.tables['oracles.a'](nameToBigInt(orngContract.name.toString()))
        .getTableRows();
      const reactivatedOracle = oraclesTableAfterReset.find(r => r.oracle === suspendOracle.name.toString());
      expect(reactivatedOracle.suspended).to.equal(false);
      expect(reactivatedOracle.strikes).to.equal(0);

      // Verify stipend is active again
      const ostipAfterReactivation = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      expect(ostipAfterReactivation.active).to.be.true;

      // Accrued amount should be the same (no retroactive rewards for suspension period)
      const accruedAfterReactivation = Number(ostipAfterReactivation.usd_accrued);
      expect(accruedAfterReactivation).to.be.at.least(accruedBeforeReactivation - 100);
      expect(accruedAfterReactivation).to.be.at.most(accruedBeforeReactivation + 100);

      // Wait 60 seconds after reactivation
      blockchain.addTime(seconds(60));

      // Trigger accrual
      await orngContract.actions.setstipend([
        suspendOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Check accrued amount
      const ostipAfterWait = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      const accruedAfterWait = Number(ostipAfterWait.usd_accrued);

      // Calculate expected accrual for ONLY the 60 seconds after reactivation
      // NOT the 60 seconds during suspension
      const expectedNewAccrual = calculateStipendAccrual(60, 2592000);
      const expectedTotal = accruedAfterReactivation + expectedNewAccrual;

      // Verify accrual matches 60 seconds only (not 120 seconds which would include suspension)
      expect(accruedAfterWait).to.be.at.least(expectedTotal - 100);
      expect(accruedAfterWait).to.be.at.most(expectedTotal + 100);

      // Also verify it's NOT the amount that would include suspension period
      // If retroactive, would be: accruedAfterReactivation + 120 seconds of accrual
      const suspensionPeriodAccrual = calculateStipendAccrual(60, 2592000); // 60 seconds during suspension
      const wouldBeIfRetroactive = accruedAfterReactivation + calculateStipendAccrual(120, 2592000);
      // The actual amount should be significantly less than the retroactive amount
      expect(accruedAfterWait).to.be.below(wouldBeIfRetroactive - suspensionPeriodAccrual + 200); // Should be ~60s less
    });

    it('should resume normal accrual after reactivation', async () => {
      // Get current accrued amount
      const ostipBefore = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      const accruedBefore = Number(ostipBefore.usd_accrued);
      expect(ostipBefore.active).to.be.true;

      // Wait another 30 seconds
      blockchain.addTime(seconds(30));

      // Trigger accrual
      await orngContract.actions.setstipend([
        suspendOracle.name.toString(),
        true
      ]).send('orng.wax@active');

      // Check accrued amount increased by expected amount
      const ostipAfter = orngContract.tables['ostip.a'](nameToBigInt('orng.wax'))
        .getTableRow(nameToBigInt(suspendOracle.name.toString()));
      const accruedAfter = Number(ostipAfter.usd_accrued);

      const expectedAccrual = calculateStipendAccrual(30, 2592000);
      const actualAccrual = accruedAfter - accruedBefore;

      // Verify normal accrual is working
      expect(actualAccrual).to.be.at.least(expectedAccrual - 100);
      expect(actualAccrual).to.be.at.most(expectedAccrual + 100);
    });
  });
});
