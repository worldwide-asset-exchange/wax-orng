const { Chain, Account } = require('qtest-js');
const crypto = require('crypto');
const fs = require('fs');
const { RSASigning, make_msg } = require('./rsaSigning.js');
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
function getActivePermission(actors) {
  const permissions = [];
  for (const actor of actors) {
    let permission = {
      actor,
      permission: "active",
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

describe('Oracle Stipend System Tests', () => {
  let chain;
  let systemContract = 'eosio';
  let orngContract = 'orng.wax';
  let govAccount = 'orng.wax';
  let orngOracle = 'oracle.wax';
  let orngOracle2 = 'oracle2.wax';
  let orngOracle3 = 'oracle3.wax';
  let delphiAccount = "delphioracle";
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
    await delphiAccount.contract.action.newbounty(
      {
        proposer: delphiAccount.name,
        pair: {
          name: "waxpusd",
          base_symbol: "8,WAXP",
          base_type: 4,
          base_contract: "",
          quote_symbol: "2,USD",
          quote_type: 1,
          quote_contract: "",
          quoted_precision: 4,
        },
      },
      getActivePermission([delphiAccount.name]),
    );
    await delphiAccount.contract.table.datapoints.insert({
      waxpusd: [
        {
          id: 21,
          owner: "pink.gg",
          value: 3090,
          median: 3064,
          timestamp: "2021-09-12T13:29:43.500",
        },
        {
          id: 22,
          owner: "wizardsguild",
          value: 3075,
          median: 3075,
          timestamp: "2021-09-12T13:30:01.000",
        },
        {
          id: 23,
          owner: "wax.eastern",
          value: 3068,
          median: 3075,
          timestamp: "2021-09-12T13:30:03.500",
        },
        {
          id: 24,
          owner: "alohaeosprod",
          value: 3075,
          median: 3075,
          timestamp: "2021-09-12T13:30:04.500",
        },
        {
          id: 25,
          owner: "ivote4waxusa",
          value: 3134,
          median: 3075,
          timestamp: "2021-09-12T13:30:05.000",
        },
        {
          id: 26,
          owner: "eosphereiobp",
          value: 3067,
          median: 3075,
          timestamp: "2021-09-12T13:30:07.000",
        },
        {
          id: 27,
          owner: "eosdublinwow",
          value: 3128,
          median: 3075,
          timestamp: "2021-09-12T13:30:16.000",
        },
        {
          id: 28,
          owner: "bountyblokbp",
          value: 3067,
          median: 3066,
          timestamp: "2021-09-12T13:29:58.000",
        },
        {
          id: 29,
          owner: "blocksmithio",
          value: 3065,
          median: 3066,
          timestamp: "2021-09-12T13:30:00.000",
        },
        {
          id: 30,
          owner: "liquidstudio",
          value: 3075,
          median: 3067,
          timestamp: "2021-09-12T13:30:00.500",
        },
      ],
    });
  }
  beforeAll(async () => {
    jest.setTimeout(600000); // 10 minutes for long-running tests
    chain = await Chain.setupChain('WAX');
    orngContract = await chain.system.createAccount(orngContract, "10000.00000000 WAX", 4565215);
    orngOracle = await chain.system.createAccount(orngOracle, "10000.00000000 WAX", 4565215);
    orngOracle2 = await chain.system.createAccount(orngOracle2, "10000.00000000 WAX", 4565215);
    orngOracle3 = await chain.system.createAccount(orngOracle3, "10000.00000000 WAX", 4565215);
    delphiAccount = await chain.system.createAccount(delphiAccount, "1000.00000000 WAX", 4565215);
    treasuryAccount = await chain.system.createAccount('treasury1', '10000.00000000 WAX', 4565215);
    govAccount = orngContract;
    await orngContract.setContract({
      abi: './build/wax.orng.abi',
      wasm: './build/wax.orng.wasm',
    });
    await orngContract.addCode('active');
    await delphiAccount.setContract({
      abi: "./tests/contracts/delphioracle.abi",
      wasm: "./tests/contracts/delphioracle.wasm",
    });
    await delphiAccount.addCode("active");
    await initDelphioracle(delphiAccount);
    await orngContract.contract.action.setpubkey(
      {
        version: 1,
        exponent: exponent0,
        modulus: modulus0,
      },
      [
        {
          actor:  govAccount.name,
          permission: 'active',
        },
      ]
    );
    await orngContract.contract.action.setoracles(
      {
        oracles: [orngOracle.name, orngOracle2.name, orngOracle3.name],
      },
      [
        {
          actor: govAccount.name,
          permission: 'active',
        },
      ]
    );
    // Initial v2 config
    await orngContract.contract.action.configv2(
      {
        fee_per_call: '0.00500000 WAX',
        strike_max: 3,
        k_calls_per_wax: 10,
        free_calls_per_hour: 0,
        treas_hardfloor: 10,
      },
      [
        {
          actor: orngContract.name,
          permission: 'active',
        },
      ]
    );
    // Fund treasury
    await treasuryAccount.transfer(orngContract.name, '1000.00000000 WAX', 'treasury');
  });
  afterAll(async () => {
    await chain.clear();
  }, 10000);
  describe('configv3 Action Tests', () => {
    it('should set configv3 with all parameters', async () => {
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 1000000, // $100/month in BASE_PRECISION
          minclaimint: 86400,    // 24 hours
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
      // Verify stipendmonth
      const stipendConfig = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'stipendmonth',
        upper_bound: 'stipendmonth',
      });
      expect(stipendConfig.rows[0].value).toBe(1000000);
      // Verify minclaimint
      const minClaimConfig = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'minclaimint',
        upper_bound: 'minclaimint',
      });
      expect(minClaimConfig.rows[0].value).toBe(86400);
    });
    it('should require contract auth for configv3', async () => {
      await expect(
        orngContract.contract.action.configv3(
          {
            stipendmonth: 500000,
            minclaimint: 43200
          },
          [
            {
              actor: orngOracle.name,
              permission: 'active',
            },
          ]
        )
      ).rejects.toThrow('missing authority of ' + orngContract.name);
    });
    it('should update existing config values', async () => {
      // Set initial
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 2000000,
          minclaimint: 3600
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
      // Update
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 1500000,
          minclaimint: 7200
        },
        [
          {
            actor: orngContract.name,
            permission: 'active',
          },
        ]
      );
      // Verify updates
      const stipendConfig = await orngContract.contract.table['config.a'].get({
        scope: orngContract.name,
        lower_bound: 'stipendmonth',
        upper_bound: 'stipendmonth',
      });
      expect(stipendConfig.rows[0].value).toBe(1500000);
    });
  });
  describe('Oracle Stipend Initialization Tests', () => {
    it('should auto-initialize ostip table when setting oracles', async () => {
      // ostip table should already be initialized from beforeAll
      const ostipTable = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
      });
      expect(ostipTable.rows.length).toBe(3);
      // Check first oracle
      const oracle1 = ostipTable.rows.find(r => r.oracle === orngOracle.name);
      expect(oracle1.active).toBeTruthy(); 
      expect(Number(oracle1.usd_accrued)).toBe(0);
      expect(oracle1.last_claim).toBeDefined();
      expect(oracle1.last_accrue).toBeDefined();
    });
    it('should preserve existing stipend data when re-setting oracles', async () => {
      // Set stipend config
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 1000000,
          minclaimint: 10
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Wait to accrue some stipend
      await chain.waitTillNextBlock(60); // 30 seconds
      
      // Trigger accrual
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );

      // Get current accrued amount
      const ostipBefore = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle.name,
        upper_bound: orngOracle.name,
      });
      const accruedBefore = Number(ostipBefore.rows[0].usd_accrued);
      // Re-set oracles (same list)
      await orngContract.contract.action.setoracles(
        {
          oracles: [orngOracle.name, orngOracle2.name, orngOracle3.name],
        },
        [{ actor: govAccount.name, permission: 'active' }]
      );
      // Check stipend is preserved
      const ostipAfter = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle.name,
        upper_bound: orngOracle.name,
      });
      // Should still have the accrued amount
      expect(Number(ostipAfter.rows[0].usd_accrued)).toBeGreaterThanOrEqual(accruedBefore);
    });
  });
  describe('Stipend Accrual Tests', () => {
    beforeAll(async () => {
      // Configure stipend system
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 1000000, // $100/month
          minclaimint: 10,       // 10 seconds for faster testing
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
    });


    it('should call setstipend without error (triggers accrual)', async () => {
      // This test verifies that setstipend executes successfully
      // Even though time hasn't passed, it tests the accrual code path
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );

      // Verify table state is accessible
      const ostip = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle.name,
        upper_bound: orngOracle.name,
      });

      expect(ostip.rows[0]).toBeDefined();
      expect(ostip.rows[0].active).toBeTruthy();
    });

    it('should NOT accrue when oracle is inactive', async () => {
      // Set oracle inactive
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle2.name,
          active: false,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Get initial state
      const ostipBefore = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle2.name,
        upper_bound: orngOracle2.name,
      });
      const accruedBefore = Number(ostipBefore.rows[0].usd_accrued);
      // Wait 30 seconds
      await chain.waitTillNextBlock(60);
      // Try to trigger accrual (shouldn't accrue since inactive)
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle2.name,
          active: false,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Check no accrual
      const ostipAfter = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle2.name,
        upper_bound: orngOracle2.name,
      });
      expect(Number(ostipAfter.rows[0].usd_accrued)).toBe(accruedBefore);
    });
    
    it('should accrue stipend when oracle reactivated', async () => {
      // Start with oracle2 inactive from previous test
      const ostipBefore = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle2.name,
        upper_bound: orngOracle2.name,
      });

      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle2.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
     
      const accruedBefore = Number(ostipBefore.rows[0].usd_accrued);


      // Wait and accrue
      await chain.waitTillNextBlock(60);
      // Trigger accrual
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle2.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Should have accrued
      const ostipAfter = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle2.name,
        upper_bound: orngOracle2.name,
      });
      expect(Number(ostipAfter.rows[0].usd_accrued)).toBeGreaterThan(accruedBefore);
    });
  });
  describe('Claim Action with Stipend Tests', () => {
    let testOracle;
    beforeAll(async () => {
      testOracle = await chain.system.createAccount('testoracle1', '100.00000000 WAX', 4565215);
      // Add testOracle to oracle list
      await orngContract.contract.action.setoracles(
        {
          oracles: [orngOracle.name, orngOracle2.name, orngOracle3.name, testOracle.name],
        },
        [{ actor: govAccount.name, permission: 'active' }]
      );
      // Configure stipend
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 2592000, // $259.20/month = $0.01/second for easy calculation
          minclaimint: 10
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Ensure treasury has funds
      await treasuryAccount.transfer(orngContract.name, '500.00000000 WAX', 'treasury');
    });
    it('should claim stipend only (no per-call fees)', async () => {
      // Wait 100 seconds to accrue stipend
      await chain.waitTillNextBlock(200); // 100 seconds
      // Trigger accrual before claiming
      await orngContract.contract.action.setstipend(
        {
          oracle: testOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Get oracle balance before
      const balanceBefore = await testOracle.getBalance();
      // Expected: 100 seconds * 2592000 / (30*24*3600) = 100 USD in BASE_PRECISION
      const expectedUsd = calculateStipendAccrual(100, 2592000);
      // Convert to WAX: 100 * 10000 / 3067 ≈ 326.02 WAX
      const expectedWax = usdToWaxAmount(expectedUsd, WAX_USD_PRICE);
      // Claim
      await orngContract.contract.action.claim(
        { oracle: testOracle.name },
        [{ actor: testOracle.name, permission: 'active' }]
      );
      // Check balance increased
      const balanceAfter = await testOracle.getBalance();
      const received = balanceAfter.amount - balanceBefore.amount;
      // Allow 1 WAX tolerance for rounding
      expect(received).toBeGreaterThanOrEqual(Math.floor(expectedWax / 100000000) - 1);
      expect(received).toBeLessThanOrEqual(Math.floor(expectedWax / 100000000) + 1);
      // Check ostip table updated
      const ostipAfter = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: testOracle.name,
        upper_bound: testOracle.name,
      });
      // usd_accrued should be 0 or very small residual
      expect(Number(ostipAfter.rows[0].usd_accrued)).toBeLessThan(100);
    });

    it('should enforce minimum claim interval', async () => {
      // Try to claim immediately after previous claim
      await expect(
        orngContract.contract.action.claim(
          { oracle: testOracle.name },
          [{ actor: testOracle.name, permission: 'active' }]
        )
      ).rejects.toThrow('too soon');
    });

    it('should allow claim after interval passes', async () => {
      // Wait for min interval (10 seconds = 20 blocks)
      await chain.waitTillNextBlock(20);
      // Trigger accrual
      await orngContract.contract.action.setstipend(
        {
          oracle: testOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Should work now
      await orngContract.contract.action.claim(
        { oracle: testOracle.name },
        [{ actor: testOracle.name, permission: 'active' }]
      );
    });

    it('should claim both stipend bonus and oracle work reward', async () => {
      // Create a new test oracle for this test
      const workOracle = await chain.system.createAccount('workoracle1', '100.00000000 WAX', 4565215);

      // Add workOracle to oracle list
      await orngContract.contract.action.setoracles(
        {
          oracles: [orngOracle.name, orngOracle2.name, orngOracle3.name, workOracle.name],
        },
        [{ actor: govAccount.name, permission: 'active' }]
      );

      // Configure stipend
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 2592000, // $259.20/month = $0.01/second for easy calculation
          minclaimint: 10
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );

      // Ensure treasury has funds
      await treasuryAccount.transfer(orngContract.name, '500.00000000 WAX', 'treasury');

      // Wait 30 seconds to accrue stipend
      await chain.waitTillNextBlock(60); // 30 seconds

      // Trigger accrual before work
      await orngContract.contract.action.setstipend(
        {
          oracle: workOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );

      // Now oracle does work: process a random number request
      // First, register a dapp and stake
      const testDapp = await chain.system.createAccount('testdapp1', '100.00000000 WAX', 4565215);

      await orngContract.contract.action.reguser(
        {
          user: testDapp.name,
          dapp: testDapp.name
        },
        [{ actor: testDapp.name, permission: 'active' }]
      );

      await testDapp.transfer(orngContract.name, '10.00000000 WAX', `stake-${testDapp.name}`);
      // Also deposit for fee payments
      await testDapp.transfer(orngContract.name, '1.00000000 WAX', `deposit-${testDapp.name}`);

      // Request random number (this will create work for oracles)
      await orngContract.contract.action.requestrand(
        {
          assoc_id: 12345,
          signing_value: 999999,
          caller: testDapp.name
        },
        [{ actor: testDapp.name, permission: 'active' }]
      );

      // Get request ID from table
      const reqs = await orngContract.contract.table.reqs.get({
        scope: orngContract.name
      });
      expect(reqs.rows.length).toBe(1);
      const requestId = reqs.rows[0].id;

      // Oracle completes the work to earn reward
      const rsaSigning = new RSASigning(getRSAPrivateKey(1));
      const msg = make_msg(reqs.rows[0].seed, testDapp.name, reqs.rows[0].nonce);
      const signature = rsaSigning.generateRandomNumber(msg);

      await orngContract.contract.action.setrand(
        {
          oracle: workOracle.name,
          id: requestId,
          ver: 1,
          sig: signature
        },
        [{ actor: workOracle.name, permission: 'active' }]
      );

      // Get oracle balance before claim
      const balanceBefore = await workOracle.getBalance();

      // Get balance table before claim to check work reward
      const balancesBefore = await orngContract.contract.table.balances.get({
        scope: orngContract.name,
        lower_bound: workOracle.name,
        upper_bound: workOracle.name
      });

      // Parse work reward - unpaid is an asset like "0.00500000 WAX"
      let expectedWorkRewardWax = 0;
      if (balancesBefore.rows.length > 0) {
        const unpaidStr = balancesBefore.rows[0].unpaid;
        expectedWorkRewardWax = parseFloat(unpaidStr.split(' ')[0]);
      }

      // Expected stipend: 30 seconds * 2592000 / (30*24*3600) = 30 USD in BASE_PRECISION
      const expectedStipendUsd = calculateStipendAccrual(30, 2592000);
      const expectedStipendWax = usdToWaxAmount(expectedStipendUsd, WAX_USD_PRICE);
      const expectedStipendWaxFloat = expectedStipendWax / 100000000; // Convert to WAX units

      // Claim both stipend and work reward
      await orngContract.contract.action.claim(
        { oracle: workOracle.name },
        [{ actor: workOracle.name, permission: 'active' }]
      );

      // Check balance increased
      const balanceAfter = await workOracle.getBalance();
      const receivedWax = balanceAfter.amount - balanceBefore.amount;

      // Expected total = work reward + stipend (both in WAX float)
      const expectedTotalWax = expectedWorkRewardWax + expectedStipendWaxFloat;

      // Allow tolerance for rounding
      expect(receivedWax).toBeGreaterThanOrEqual(expectedTotalWax - 0.01); // 0.01 WAX tolerance
      expect(receivedWax).toBeLessThanOrEqual(expectedTotalWax + 0.01);

      // Verify work reward was cleared (or reduced to 0)
      const balancesAfter = await orngContract.contract.table.balances.get({
        scope: orngContract.name,
        lower_bound: workOracle.name,
        upper_bound: workOracle.name
      });
      // Balance entry may still exist but unpaid should be 0
      if (balancesAfter.rows.length > 0) {
        expect(balancesAfter.rows[0].unpaid).toBe("0.00000000 WAX");
      }

      // Verify stipend was mostly cleared (may have small residual)
      const ostipAfter = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: workOracle.name,
        upper_bound: workOracle.name,
      });
      expect(Number(ostipAfter.rows[0].usd_accrued)).toBeLessThan(100);
    });
  });
  describe('setstipend Action Tests', () => {
    it('should manually set oracle active status', async () => {
      // Set inactive
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle3.name,
          active: false,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      const ostip1 = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle3.name,
        upper_bound: orngOracle3.name,
      });
      expect(ostip1.rows[0].active).toBeFalsy();
      // Set active again
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle3.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      const ostip2 = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle3.name,
        upper_bound: orngOracle3.name,
      });
      expect(ostip2.rows[0].active).toBeTruthy();
    });
    it('should require contract auth for setstipend', async () => {
      await expect(
        orngContract.contract.action.setstipend(
          {
            oracle: orngOracle.name,
            active: false,
          },
          [{ actor: orngOracle.name, permission: 'active' }]
        )
      ).rejects.toThrow('missing authority of ' + orngContract.name);
    });
    it('should preserve usd_accrued when toggling active', async () => {
      // Configure and accrue
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 1000000,
          minclaimint: 10
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Ensure active
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Wait to accrue
      await chain.waitTillNextBlock(60);
      // Trigger accrual
      try {
        await orngContract.contract.action.claim(
          { oracle: orngOracle.name },
          [{ actor: orngOracle.name, permission: 'active' }]
        );
      } catch (e) {
        // May fail due to timing, but will accrue
      }
      // Get accrued amount
      const ostipBefore = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle.name,
        upper_bound: orngOracle.name,
      });
      const accruedBefore = Number(ostipBefore.rows[0].usd_accrued);
      // Toggle inactive then active
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle.name,
          active: false,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      await orngContract.contract.action.setstipend(
        {
          oracle: orngOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      // Check preserved
      const ostipAfter = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: orngOracle.name,
        upper_bound: orngOracle.name,
      });
      expect(Number(ostipAfter.rows[0].usd_accrued)).toBeGreaterThanOrEqual(accruedBefore);
    });
  });
  describe('Integration: Claim Throttling Tests', () => {
    let throttleOracle;
    beforeAll(async () => {
      throttleOracle = await chain.system.createAccount('throttle1', '100.00000000 WAX', 4565215);
      await orngContract.contract.action.setoracles(
        {
          oracles: [orngOracle.name, orngOracle2.name, orngOracle3.name, throttleOracle.name],
        },
        [{ actor: govAccount.name, permission: 'active' }]
      );
      await orngContract.contract.action.configv3(
        {
          stipendmonth: 2592000,
          minclaimint: 60, // 1 minute
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
    });
    it('should calculate time correctly across multiple claims', async () => {
      // Wait and claim at T=0
      await chain.waitTillNextBlock(120); // 60 seconds
      // Trigger accrual before first claim
      await orngContract.contract.action.setstipend(
        {
          oracle: throttleOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      await orngContract.contract.action.claim(
        { oracle: throttleOracle.name },
        [{ actor: throttleOracle.name, permission: 'active' }]
      );
      const ostip1 = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: throttleOracle.name,
        upper_bound: throttleOracle.name,
      });
      const claim1Time = ostip1.rows[0].last_claim;
      // Wait 60+ seconds and claim at T=60
      await chain.waitTillNextBlock(120);
      // Trigger accrual before second claim
      await orngContract.contract.action.setstipend(
        {
          oracle: throttleOracle.name,
          active: true,
        },
        [{ actor: orngContract.name, permission: 'active' }]
      );
      await orngContract.contract.action.claim(
        { oracle: throttleOracle.name },
        [{ actor: throttleOracle.name, permission: 'active' }]
      );
      const ostip2 = await orngContract.contract.table['ostip.a'].get({
        scope: orngContract.name,
        lower_bound: throttleOracle.name,
        upper_bound: throttleOracle.name,
      });
      const claim2Time = ostip2.rows[0].last_claim;
      // Verify time advanced
      expect(new Date(claim2Time).getTime()).toBeGreaterThan(new Date(claim1Time).getTime());
    });
  });
});
