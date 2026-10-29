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

function stringHashToNum(str) {
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    let bytes = str.slice(i * 2, i * 2 + 2);
    const a = parseInt(bytes, 16) & 127;
    result = (result << BigInt(8)) + BigInt(a);
  }
  return result.toString();
}

describe('test adaptive staking', () => {
  let blockchain;
  let orngContract;
  let orngOracle;
  let orngOracle2;
  let orngOracle3;
  let orngOracle4;
  let treasuryAccount;
  let eosioToken;

  // Test dapp accounts for staking scenarios
  let dapp1, dapp2, dapp3, dapp4, dappPaid;
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

    // Create regular accounts
    const accounts = blockchain.createAccounts(
      'oracle.wax',
      'oracle2.wax',
      'oracle3.wax',
      'oracle4.wax',
      'treasury',
      'dapp1',
      'dapp2',
      'dapp3',
      'dapp4',
      'dapppaid',
      'staker1',
      'staker2',
      'staker3'
    );

    orngOracle = accounts[0];
    orngOracle2 = accounts[1];
    orngOracle3 = accounts[2];
    orngOracle4 = accounts[3];
    treasuryAccount = accounts[4];
    dapp1 = accounts[5];
    dapp2 = accounts[6];
    dapp3 = accounts[7];
    dapp4 = accounts[8];
    dappPaid = accounts[9];
    staker1 = accounts[10];
    staker2 = accounts[11];
    staker3 = accounts[12];

    // Create eosio.token contract
    eosioToken = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
      enableInline: true,
    });

    // Create and issue WAX tokens
    await eosioToken.actions.create([eosioToken.name, "1000000.00000000 WAX"]).send(eosioToken.name.toString() + '@active');
    await eosioToken.actions.issue([
      eosioToken.name,
      "1000000.00000000 WAX",
      "issue",
    ]).send(eosioToken.name.toString() + '@active');

    // Fund all accounts
    for (const account of [...accounts, dapp1, dapp2, dapp3, dapp4, dappPaid]) {
      await eosioToken.actions.transfer([
        eosioToken.name.toString(),
        account.name.toString(),
        '10000.00000000 WAX',
        'initial funding'
      ]).send(eosioToken.name.toString() + '@active');
    }

    // Create ORNG contract account with contract
    orngContract = blockchain.createAccount({
      name: Name.from('orng.wax'),
      wasm: fs.readFileSync('./build/wax.orng.wasm'),
      abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
      enableInline: true,
    });

    // Deploy receiver contract for dapp1
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
      18000,
      900,
      1800,
      3,
      100,
      60,
      10
    ]).send('orng.wax@active');

    // Fund treasury
    await eosioToken.actions.transfer([
      treasuryAccount.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'treasury'
    ]).send('treasury@active');
  });

  after(async () => {
    // Cleanup if needed
  });

  // Helper function to submit random number from oracles
  async function submitRandom(id, seedHex, nonce, dapp, oracle) {
    const rsaSigning = new RSASigning(getRSAPrivateKey(1));
    const msg = make_msg(seedHex, dapp, nonce);
    const sig = rsaSigning.generateRandomNumber(msg);

    // Submit from oracle
    return await orngContract.actions.setrand([
      oracle,
      id,
      1,
      sig
    ]).send(oracle + '@active');
  }

  async function batchPaidJob() {
    await orngContract.actions.configadptive([
      18000,
      900,
      1800,
      0, // set free to zero
      100,
      60,
      10
    ]).send('orng.wax@active');

    // Deposit WAX (no staking, so credits will be 0 and call will be paid)
    await eosioToken.actions.transfer([
      dappPaid.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'deposit-' + dappPaid.name.toString()
    ]).send('dapppaid@active');

    let tx;
    let numberOfAddingJob = 10;
    for(let i = 0; i < numberOfAddingJob; i++) {
      // Request random number (this will be a PAID call since credits = 0)
      const assocId = 2235 + i;
      const signingValue = 3345 + i;
      await orngContract.actions.requestrand([
        assocId,
        signingValue,
        dappPaid.name.toString()
      ]).send('dapppaid@active');

      // Get request ID
      const requestTable = orngContract.tables['reqs'](
        nameToBigInt('orng.wax')
      ).getTableRows();
      let request = requestTable[requestTable.length - 1];

      if (i >= numberOfAddingJob - 1) {
        // Wait more time before fulfilling to create measurable time difference
        blockchain.addTime(seconds(11)); // > 10 seconds
      }else{
        blockchain.addTime(seconds(1));
      }

      // Submit random number from oracle
      tx = await submitRandom(request.id, request.seed, request.nonce, dappPaid.name.toString(), orngOracle.name.toString());
    }

    const requestTable = orngContract.tables['reqs'](nameToBigInt('orng.wax')).getTableRows();

    // Get updated rngstats
    const rngstatsTableAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTableAfter.length).to.equal(1);
    // paid_count_window should be reset to 0 after EMA update
    expect(rngstatsTableAfter[0].paid_count_window).to.equal(0);
    // Just check that last_ema_update exists
    expect(rngstatsTableAfter[0].last_ema_update).to.exist;
    expect(parseFloat(rngstatsTableAfter[0].paid_rate_ema_ch)).to.be.above(0);
  }

  it('No staking - get per_dapp_min', async () => {
    // Get updated rngstats
    const rngstatsTableBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTableBefore.length).to.equal(0);

    // Request random number (get free credits)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp1.name.toString()
    ]).send('dapp1@active');

    // Get request ID
    const requestTable = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestTable[requestTable.length - 1];

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsTableAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTableAfter.length).to.equal(1);

    expect(+rngstatsTableAfter[0].paid_rate_ema_ch).to.equal(0);
    // Just check that last_ema_update exists (don't compare to transaction time)
    expect(rngstatsTableAfter[0].last_ema_update).to.exist;
    expect(rngstatsTableAfter[0].paid_count_window).to.equal(0);

    // Get account state table
    const accountStateTable = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(accountStateTable.length).to.equal(1);
    expect(accountStateTable[0].dapp).to.equal(dapp1.name.toString());
    // 3 free credits but already used 1
    expect(accountStateTable[0].credits).to.equal(2);

    const stakestatsTable = orngContract.tables['stakestats'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    expect(stakestatsTable.length).to.equal(0);
  });

  it('No staking - consume all free credits', async () => {
    // Get updated rngstats
    const rngstatsTableBefore = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTableBefore.length).to.equal(1);

    let tx;
    for (let i = 0; i < 2; i++) {
      // Request random number (get free credits)
      const assocId = 1002 + i;
      const signingValue = 12346 + i;
      await orngContract.actions.requestrand([
        assocId,
        signingValue,
        dapp1.name.toString()
      ]).send('dapp1@active');

      // Get request ID
      const requestTable = orngContract.tables['reqs'](
        nameToBigInt('orng.wax')
      ).getTableRows();
      let request = requestTable[requestTable.length - 1];

      // Submit random number from oracle
      tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());
    }

    // Get updated rngstats
    const rngstatsTableAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTableAfter.length).to.equal(1);

    expect(+rngstatsTableAfter[0].paid_rate_ema_ch).to.equal(0);
    expect(rngstatsTableAfter[0].last_ema_update).to.equal(rngstatsTableBefore[0].last_ema_update);
    expect(rngstatsTableAfter[0].paid_count_window).to.equal(0);

    // Get account state table
    const accountStateTable = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(accountStateTable.length).to.equal(1);
    expect(accountStateTable[0].dapp).to.equal(dapp1.name.toString());
    expect(accountStateTable[0].credits).to.equal(0);


    const stakestatsTable = orngContract.tables['stakestats'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    expect(stakestatsTable.length).to.equal(0);
  });

  it('No staking - throw if no more credits', async () => {
    const assocId = 1005;
    const signingValue = 12350;
    await expectToThrow(
      orngContract.actions.requestrand([
        assocId,
        signingValue,
        dapp1.name.toString()
      ]).send('dapp1@active'),
      `eosio_assert_message: WAX RNG: ${dapp1.name.toString()} is out of usage credits - alert operator (see https://github.com/worldwide-asset-exchange/wax-orng)`
    );

    const stakestatsTable = orngContract.tables['stakestats'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    expect(stakestatsTable.length).to.equal(0);
  });

  it('No staking - refill free credits', async () => {
    await orngContract.actions.configadptive([
      18000,
      900,
      1800,
      900, // increase credit to get more refill after a short time
      100,
      60,
      10
    ]).send('orng.wax@active');

    const accountStateTableBefore = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    blockchain.addTime(seconds(20)); // 10 seconds

    // Request random number (get free credits)
    const assocId = 1011;
    const signingValue = 12355;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp1.name.toString()
    ]).send('dapp1@active');

    // Get request ID
    const requestTable = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestTable[requestTable.length - 1];

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp1.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsTableAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTableAfter.length).to.equal(1);

    expect(+rngstatsTableAfter[0].paid_rate_ema_ch).to.equal(0);
    // Just check that last_ema_update exists (don't compare to transaction time)
    expect(rngstatsTableAfter[0].last_ema_update).to.exist;
    expect(rngstatsTableAfter[0].paid_count_window).to.equal(0);

    // Get account state table
    const accountStateTableAfter = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    let timeDiff = Math.floor((new Date(accountStateTableAfter[0].last_update).getTime() - new Date(accountStateTableBefore[0].last_update).getTime()) / 1000);
    // per_dapp_min_calls_per_hr == 900;
    let estimatedCredits = 900 * (timeDiff / 3600);
    // subtract one credit for the requestrand above
    expect(accountStateTableAfter[0].credits).to.equal(Math.floor(estimatedCredits) - 1);

    const stakestatsTable = orngContract.tables['stakestats'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    expect(stakestatsTable.length).to.equal(0);
  });

  it('No staking - dapp2 get per_dapp_min', async () => {
    await orngContract.actions.configadptive([
      18000,
      900,
      1800,
      3,
      100,
      60,
      10
    ]).send('orng.wax@active');

    // Request random number (get free credits)
    const assocId = 1001;
    const signingValue = 12345;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp2.name.toString()
    ]).send('dapp2@active');

    // Get request ID
    const requestTable = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestTable[requestTable.length - 1];

    // Submit random number from oracle
    const tx = await submitRandom(request.id, request.seed, request.nonce, dapp2.name.toString(), orngOracle.name.toString());

    // Get updated rngstats
    const rngstatsTableAfter = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTableAfter.length).to.equal(1);

    expect(+rngstatsTableAfter[0].paid_rate_ema_ch).to.equal(0);
    expect(rngstatsTableAfter[0].paid_count_window).to.equal(0);

    // Get account state table - need to filter by dapp2
    const allAccountStates = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTable = allAccountStates.filter(row => row.dapp === dapp2.name.toString());

    expect(accountStateTable.length).to.equal(1);
    expect(accountStateTable[0].dapp).to.equal(dapp2.name.toString());
    // 3 free credits but already used 1
    expect(accountStateTable[0].credits).to.equal(2);

    const stakestatsTable = orngContract.tables['stakestats'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    expect(stakestatsTable.length).to.equal(0);
  });

  it('paid_rate_ema_ch = 0, stake and get credits', async () => {
    await orngContract.actions.configadptive([
      18000,
      900,
      1800,
      0, // no free credits
      100,
      60,
      10
    ]).send('orng.wax@active');

    await eosioToken.actions.transfer([
      dapp4.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'stake-' + dapp4.name.toString()
    ]).send('dapp4@active');

    // Get account state table - filter by dapp4
    const allAccountStatesBefore = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTableBefore = allAccountStatesBefore.filter(row => row.dapp === dapp4.name.toString());

    expect(accountStateTableBefore.length).to.equal(1);
    expect(accountStateTableBefore[0].dapp).to.equal(dapp4.name.toString());
    expect(accountStateTableBefore[0].credits).to.equal(0);

    blockchain.addTime(seconds(10)); // 5 seconds

    const assocId = 1005;
    const signingValue = 12350;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp4.name.toString()
    ]).send('dapp4@active');

    const rngstatsTable = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTable.length).to.equal(1);
    expect(parseFloat(rngstatsTable[0].paid_rate_ema_ch)).to.equal(0);

    // Get adaptive config for calculation
    const adaptiveConfigTable = orngContract.tables['adaptcfg'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    const stakestatsTable = orngContract.tables['stakestats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Get account state table - filter by dapp4
    const allAccountStatesAfter = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTableAfter = allAccountStatesAfter.filter(row => row.dapp === dapp4.name.toString());

    let timeDiff = Math.floor((new Date(accountStateTableAfter[0].last_update).getTime() - new Date(accountStateTableBefore[0].last_update).getTime()) / 1000);
    // no one paid yet so paid_rate_ema_ch === 0
    const tFree = adaptiveConfigTable[0].total_capacity_calls_per_hr - adaptiveConfigTable[0].headroom_calls_per_hr;
    let estimatedCredits = tFree * (1000000000 / parseInt(stakestatsTable[0].total_stake_amount)) * (timeDiff / 3600);
    // subtract one credit for the requestrand above
    expect(accountStateTableAfter[0].credits).to.equal(Math.floor(estimatedCredits) - 1);
  });

  it('subtract paid_ema to get free capacity', async () => {
    await batchPaidJob();

    await eosioToken.actions.transfer([
      dapp2.name.toString(),
      orngContract.name.toString(),
      '10.00000000 WAX',
      'stake-' + dapp2.name.toString()
    ]).send('dapp2@active');

    // Get account state table - filter by dapp2
    const allAccountStatesBefore = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTableBefore = allAccountStatesBefore.filter(row => row.dapp === dapp2.name.toString());

    expect(accountStateTableBefore.length).to.equal(1);
    expect(accountStateTableBefore[0].dapp).to.equal(dapp2.name.toString());
    expect(accountStateTableBefore[0].credits).to.equal(0);

    blockchain.addTime(seconds(10)); // 5 seconds

    const assocId = 1005;
    const signingValue = 12350;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp2.name.toString()
    ]).send('dapp2@active');

    const rngstatsTable = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTable.length).to.equal(1);
    expect(parseFloat(rngstatsTable[0].paid_rate_ema_ch)).to.be.above(0);

    // Get adaptive config for calculation
    const adaptiveConfigTable = orngContract.tables['adaptcfg'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    const stakestatsTable = orngContract.tables['stakestats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    // Get account state table - filter by dapp2
    const allAccountStatesAfter = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTableAfter = allAccountStatesAfter.filter(row => row.dapp === dapp2.name.toString());

    let timeDiff = Math.floor((new Date(accountStateTableAfter[0].last_update).getTime() - new Date(accountStateTableBefore[0].last_update).getTime()) / 1000);
    // no one paid yet so paid_rate_ema_ch === 0
    const tFree = adaptiveConfigTable[0].total_capacity_calls_per_hr - adaptiveConfigTable[0].headroom_calls_per_hr - parseFloat(rngstatsTable[0].paid_rate_ema_ch);
    let estimatedCredits = tFree * (1000000000 / parseInt(stakestatsTable[0].total_stake_amount)) * (timeDiff / 3600);
    // subtract one credit for the requestrand above
    expect(accountStateTableAfter[0].credits).to.equal(Math.floor(estimatedCredits) - 1);
  });

  it('fallback to per_dapp_min_calls_per_hr if dapp has not stake', async () => {
    await orngContract.actions.configadptive([
      18000,
      900,
      1800,
      1,
      100,
      60,
      10
    ]).send('orng.wax@active');

    const assocId = 1005;
    const signingValue = 12350;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      dapp3.name.toString()
    ]).send('dapp3@active');

    const allAccountStatesBefore = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTableBefore = allAccountStatesBefore.filter(row => row.dapp === dapp3.name.toString());

    expect(accountStateTableBefore.length).to.equal(1);
    expect(accountStateTableBefore[0].dapp).to.equal(dapp3.name.toString());
    // per_dapp_min_calls_per_hr: 1 already used in requestrand above
    expect(accountStateTableBefore[0].credits).to.equal(0);

    await orngContract.actions.configadptive([
      18000,
      900,
      1800,
      900, // increase free job
      100,
      60,
      10
    ]).send('orng.wax@active');

    blockchain.addTime(seconds(15)); // 15 seconds

    const assocId1 = 1006;
    const signingValue1 = 12351;
    await orngContract.actions.requestrand([
      assocId1,
      signingValue1,
      dapp3.name.toString()
    ]).send('dapp3@active');

    const rngstatsTable = orngContract.tables['rngstats'](
      nameToBigInt('orng.wax')
    ).getTableRows();

    expect(rngstatsTable.length).to.equal(1);
    expect(parseFloat(rngstatsTable[0].paid_rate_ema_ch)).to.be.above(0);

    // Get account state table - filter by dapp3
    const allAccountStatesAfter = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTableAfter = allAccountStatesAfter.filter(row => row.dapp === dapp3.name.toString());

    let timeDiff = Math.floor((new Date(accountStateTableAfter[0].last_update).getTime() - new Date(accountStateTableBefore[0].last_update).getTime()) / 1000);
    // per_dapp_min_calls_per_hr == 900;
    let estimatedCredits = 900 * (timeDiff / 3600);
    // subtract one credit for the requestrand above
    expect(accountStateTableAfter[0].credits).to.equal(Math.floor(estimatedCredits) - 1);
  });

  it('should initialize dApp with correct burst capacity for non-default burst_window', async () => {
    // 1. Configure with non-default burst_window_hours
    await orngContract.actions.configadptive([
      18000,  // total_capacity_calls_per_hr
      900,    // free_min_calls_per_hr
      1800,   // headroom_calls_per_hr
      10,     // per_dapp_min_calls_per_hr (0.10 calls/hr)
      200,    // burst_window_hours (2.0 hours) - NON-DEFAULT
      60,     // ema_half_life_sec
      10      // ema_min_update_sec
    ]).send('orng.wax@active');

    // 2. Initialize new dApp via requestrand (triggers acctstate creation)
    // Use staker1 as a fresh dApp (never been initialized before)
    const assocId = 2001;
    const signingValue = 22001;
    await orngContract.actions.requestrand([
      assocId,
      signingValue,
      staker1.name.toString()
    ]).send('staker1@active');

    // 3. Get request and submit random (fulfills request, uses 1 credit)
    const requestTable = orngContract.tables['reqs'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    let request = requestTable[requestTable.length - 1];
    await submitRandom(request.id, request.seed, request.nonce,
      staker1.name.toString(), orngOracle.name.toString());

    // 4. Read acctstate and verify credits
    const allAccountStates = orngContract.tables['acctstate'](
      nameToBigInt('orng.wax')
    ).getTableRows();
    const accountStateTable = allAccountStates.filter(row => row.dapp === staker1.name.toString());

    expect(accountStateTable.length).to.equal(1);
    expect(accountStateTable[0].dapp).to.equal(staker1.name.toString());

    // Expected: (10 * 200) / 100 = 20 initial credits, minus 1 used = 19
    // Bug would give: 10 initial credits, minus 1 used = 9
    expect(accountStateTable[0].credits).to.equal(19);
  });

  describe('refill clock vs third-party stakes', () => {
    // per_dapp_min = 10 calls/hr (one credit every 360 s), burst window 1.0 h => 10 credits cap
    const DUST = '0.00000001 WAX';
    const acctRow = (name) => orngContract.tables['acctstate'](nameToBigInt('orng.wax')).getTableRows()
      .find(r => r.dapp === name);
    const stakeUnits = (s) => Math.round(parseFloat(s.split(' ')[0]) * 1e8);

    async function drainFreeCredits(dapp, assocBase) {
      for (let i = 0; i < 10; i++) {
        await orngContract.actions.requestrand([assocBase + i, 7000 + i, dapp]).send(dapp + '@active');
      }
      expect(acctRow(dapp).credits).to.equal(0);
    }

    async function dustStake(from, dapp) {
      await eosioToken.actions.transfer([from, 'orng.wax', DUST, 'stake-' + dapp]).send(from + '@active');
    }

    function expectStakeInvariant() {
      const rows = orngContract.tables['acctstate'](nameToBigInt('orng.wax')).getTableRows();
      const sum = rows.reduce((acc, r) => acc + stakeUnits(r.stake), 0);
      const ss = orngContract.tables['stakestats'](nameToBigInt('orng.wax')).getTableRows();
      expect(Number(ss[0].total_stake_amount)).to.equal(sum);
    }

    before(async () => {
      await orngContract.actions.configadptive([18000, 900, 1800, 10, 100, 60, 10]).send('orng.wax@active');
      blockchain.createAccounts('victim', 'control', 'victim2', 'epochdapp', 'anchordapp', 'bigstaker');
      // pin S_total so a dust-funded dApp's share stays negligible and its rate is per_dapp_min,
      // whatever earlier specs staked (keeps this block self-contained under --grep)
      await eosioToken.actions.transfer(['eosio.token', 'bigstaker', '100000.00000000 WAX', 'funding']).send('eosio.token@active');
      await eosioToken.actions.transfer(['bigstaker', 'orng.wax', '50000.00000000 WAX', 'stake-anchordapp']).send('bigstaker@active');
    });

    it('a third-party dust stake does not reduce the credits a dApp has accrued', async () => {
      await drainFreeCredits('victim', 5000);
      await drainFreeCredits('control', 5100);

      blockchain.addTime(seconds(900)); // 2.5 credits accrued, not yet a whole third one
      await dustStake('staker1', 'victim');
      blockchain.addTime(seconds(180)); // 1080 s in total = exactly 3 credits of entitlement

      // touch both rows at the same instant so each one refills
      await orngContract.actions.requestrand([5200, 7777, 'victim']).send('victim@active');
      await orngContract.actions.requestrand([5201, 7777, 'control']).send('control@active');

      const victim = acctRow('victim');
      const control = acctRow('control');
      expect(control.credits).to.equal(2); // 3 accrued - 1 used
      expect(victim.credits).to.be.at.least(control.credits);
      expect(victim.credits).to.equal(2);
      expect(victim.stake).to.equal(DUST);
      expectStakeInvariant();
    });

    it('repeated dust stakes every 5 minutes for an hour leave the full hourly entitlement', async () => {
      await drainFreeCredits('victim2', 5300);
      for (let i = 0; i < 12; i++) {
        blockchain.addTime(seconds(300));
        await dustStake('staker1', 'victim2');
      }
      let victim = acctRow('victim2');
      // 12 x floor(0.8333... credit at 1e-9 resolution) is 4 nanocredits short of the 10th credit:
      // fixed-point accrual floors at the nanocredit on every refill, so that credit lands on the
      // next refill instead of being lost
      expect(victim.credits).to.equal(9);
      expect(victim.credits_nano).to.be.at.least(1e9 - 12);
      expect(new Date(victim.last_update).getTime()).to.equal(new Date(blockchain.timestamp).getTime());
      expect(stakeUnits(victim.stake)).to.equal(12);
      blockchain.addTime(seconds(1));
      await dustStake('staker1', 'victim2');
      victim = acctRow('victim2');
      expect(victim.credits).to.equal(10); // the full hourly entitlement; nothing is banked at the cap
      expect(victim.credits_nano).to.equal(0);
      expect(stakeUnits(victim.stake)).to.equal(13);
      expectStakeInvariant();
    });

    it('credits never exceed the burst cap and the clock catches up once the cap is hit', async () => {
      // victim2 sits at the cap; a long idle period must not bank unbounded time
      blockchain.addTime(seconds(7200));
      await dustStake('staker1', 'victim2');
      let victim = acctRow('victim2');
      expect(victim.credits).to.equal(10);
      expect(new Date(victim.last_update).getTime()).to.equal(new Date(blockchain.timestamp).getTime());

      // spend one credit, then only a few seconds pass: no instant refill from banked time
      await orngContract.actions.requestrand([5400, 7777, 'victim2']).send('victim2@active');
      blockchain.addTime(seconds(5));
      await dustStake('staker1', 'victim2');
      victim = acctRow('victim2');
      expect(victim.credits).to.equal(9);
    });

    it('with a non-integer credit period, dust pings lose less than one second per matured credit', async () => {
      // 7 calls/hr: 0.58333... credit per 300 s ping, floored to 583333333 nanocredits each
      await orngContract.actions.configadptive([18000, 900, 1800, 7, 100, 60, 10]).send('orng.wax@active');
      blockchain.createAccounts('victim3');
      for (let i = 0; i < 7; i++) {
        await orngContract.actions.requestrand([5600 + i, 7000 + i, 'victim3']).send('victim3@active');
      }
      expect(acctRow('victim3').credits).to.equal(0);
      for (let i = 0; i < 12; i++) {
        blockchain.addTime(seconds(300));
        await dustStake('staker1', 'victim3');
      }
      // exact entitlement after 3600 s is 7.0 credits; 12 floors leave the 7th credit 4 nanocredits short
      expect(acctRow('victim3').credits).to.be.at.least(6);
      blockchain.addTime(seconds(6));
      await dustStake('staker1', 'victim3');
      expect(acctRow('victim3').credits).to.equal(7);
      await orngContract.actions.configadptive([18000, 900, 1800, 10, 100, 60, 10]).send('orng.wax@active');
    });

    it('a row with an unset clock (last_update = 0) refills to the cap without overflowing', async () => {
      orngContract.tables['acctstate'](nameToBigInt('orng.wax')).set(nameToBigInt('epochdapp'), orngContract.name, {
        dapp: 'epochdapp',
        stake: '0.00000000 WAX',
        credits: 0,
        fee_balance: '0.00000000 WAX',
        last_nonce: 0,
        last_update: '1970-01-01T00:00:00',
      });
      await orngContract.actions.requestrand([5500, 7777, 'epochdapp']).send('epochdapp@active');
      const row = acctRow('epochdapp');
      expect(row.credits).to.equal(9); // capped at 10, one used
      expect(new Date(row.last_update).getTime()).to.equal(new Date(blockchain.timestamp).getTime());
    });

    describe('sub-second accrual: credits_nano carries the fraction of a credit', () => {
      const NANO = 1e9;
      const acctTable = () => orngContract.tables['acctstate'](nameToBigInt('orng.wax'));
      const nowMs = () => new Date(blockchain.timestamp).getTime();
      const isoSecondsAgo = (s) => new Date(nowMs() - s * 1000).toISOString().slice(0, 19);
      // the v3.3.0 row shape: no credits_nano field; payer = the dApp, as one mainnet row is
      const seedLegacyRow = (dapp, credits, last_update) => acctTable().set(nameToBigInt(dapp), Name.from(dapp), {
        dapp,
        stake: '0.00000000 WAX',
        credits,
        fee_balance: '0.00000000 WAX',
        last_nonce: 0,
        last_update,
      });
      const configure = (cfg) => orngContract.actions.configadptive(cfg).send('orng.wax@active');
      const CONFIG_MIN_10 = [18000, 900, 1800, 10, 100, 60, 10];
      const tFree = () => {
        const cfg = orngContract.tables['adaptcfg'](nameToBigInt('orng.wax')).getTableRows()[0];
        const st = orngContract.tables['rngstats'](nameToBigInt('orng.wax')).getTableRows()[0];
        const ema = st ? Math.max(0, Number(st.paid_rate_ema_ch)) : 0;
        return Math.max(
          Number(cfg.free_min_calls_per_hr),
          Number(cfg.total_capacity_calls_per_hr) - Number(cfg.headroom_calls_per_hr) - ema
        );
      };
      const totalNano = (row) => row.credits * NANO + row.credits_nano;

      before(async () => {
        blockchain.createAccounts('legacydapp', 'whale', 'riser', 'capdapp');
        await eosioToken.actions.transfer(['eosio.token', 'whale', '100000.00000000 WAX', 'funding']).send('eosio.token@active');
      });

      it('a row written before v3.4.0 (no credits_nano) refills as v3.3.0 computed it and gains the field', async () => {
        seedLegacyRow('legacydapp', 3, isoSecondsAgo(900));
        expect(acctRow('legacydapp').credits_nano == null).to.equal(true); // absent binary extension
        await dustStake('staker1', 'legacydapp');
        const row = acctRow('legacydapp');
        expect(row.credits).to.equal(5); // 3 + floor(10 x 900 / 3600): the whole credits v3.3.0 gave
        expect(row.credits_nano).to.equal(NANO / 2); // the half credit v3.3.0 discarded is carried
        expect(new Date(row.last_update).getTime()).to.equal(nowMs());
        expectStakeInvariant();
      });

      it('R3-1: dust pings every second at a high rate no longer strip the entitlement', async () => {
        // 3599 calls/hr: credit period 1.0003 s. With a one-second clock a 1 s ping cadence lost ~50 %
        await configure([18000, 900, 1800, 3599, 100, 60, 10]);
        seedLegacyRow('whale', 0, isoSecondsAgo(0));
        const T = 600;
        for (let i = 0; i < T; i++) {
          blockchain.addTime(seconds(1));
          await dustStake('staker1', 'whale');
        }
        const row = acctRow('whale');
        const entitlement = Math.floor((3599 * T) / 3600); // 599
        expect(row.credits).to.be.at.least(entitlement - 1);
        expect(row.credits).to.be.at.most(entitlement);
        expectStakeInvariant();
      });

      it('a dApp refilling itself every second for an hour gets floor(rate) and never more', async () => {
        await configure([18000, 900, 1800, 3599, 200, 60, 10]); // cap 7198 so a full hour fits
        const before = acctRow('whale');
        for (let i = 0; i < 3600; i++) {
          blockchain.addTime(seconds(1));
          await dustStake('whale', 'whale');
        }
        const after = acctRow('whale');
        const gained = totalNano(after) - totalNano(before);
        expect(gained).to.be.at.most(3599 * NANO); // never more than the hourly rate
        expect(gained).to.be.at.least(3599 * NANO - 3600); // floor at 1e-9 credit per refill
        expect(after.credits - before.credits).to.be.within(3598, 3599);
        expect(new Date(after.last_update).getTime()).to.equal(nowMs());
      });

      it('a stake increase mid-period carries the fraction as credits, not time: no re-valuation gain', async () => {
        await configure(CONFIG_MIN_10);
        seedLegacyRow('riser', 0, isoSecondsAgo(359)); // 359/360 of a credit due at the minimum rate
        await dustStake('staker1', 'riser');
        let row = acctRow('riser');
        expect(row.credits).to.equal(0);
        expect(row.credits_nano).to.equal(Math.floor((359 / 360) * NANO));

        // a large stake raises the dApp's rate from 10/h to r2
        await eosioToken.actions.transfer(['bigstaker', 'orng.wax', '40000.00000000 WAX', 'stake-riser']).send('bigstaker@active');
        blockchain.addTime(seconds(1));
        await dustStake('staker1', 'riser');
        row = acctRow('riser');
        const S_total = Number(orngContract.tables['stakestats'](nameToBigInt('orng.wax')).getTableRows()[0].total_stake_amount);
        const r2 = Math.max(10, (tFree() * stakeUnits(row.stake)) / S_total);
        expect(r2).to.be.above(1000);
        // exact entitlement: 359/360 credit carried + r2/3600 for the last second. A remainder kept
        // as seconds would instead have been re-valued at r2: floor(359 x r2 / 3600) credits.
        const exact = 359 / 360 + r2 / 3600;
        expect(row.credits).to.be.within(Math.floor(exact) - 1, Math.floor(exact));
        expect(row.credits).to.be.below(Math.floor((359 * r2) / 3600));
        expectStakeInvariant();
      });

      it('at a non-integer burst cap the state is clamped to exactly the cap, fraction included', async () => {
        await configure([18000, 900, 1800, 7, 150, 60, 10]); // 7/h x 1.5 h = 10.5 credits cap
        seedLegacyRow('capdapp', 0, isoSecondsAgo(7200)); // 14 credits matured against a 10.5 cap
        await dustStake('staker1', 'capdapp');
        let row = acctRow('capdapp');
        expect(row.credits).to.equal(10);
        expect(row.credits_nano).to.equal(NANO / 2);
        // spend one credit below the cap: the half credit stays and accrual resumes from 9.5
        await orngContract.actions.requestrand([5900, 7777, 'capdapp']).send('capdapp@active');
        blockchain.addTime(seconds(1));
        await dustStake('staker1', 'capdapp');
        row = acctRow('capdapp');
        expect(row.credits).to.equal(9);
        expect(row.credits_nano).to.equal(NANO / 2 + Math.floor((7 * NANO) / 3600));
        await configure(CONFIG_MIN_10);
        expectStakeInvariant();
      });
    });
  });
});
