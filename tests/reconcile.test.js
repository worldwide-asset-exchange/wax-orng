const vert = require('@waxio/vert');
const { Blockchain, nameToBigInt, expectToThrow, mintTokens } = vert;
const { assert } = require('chai');
const fs = require('fs');
const { Name } = require('@wharfkit/antelope');

// 8-decimal WAX in base units as a string, from a number of whole WAX (exact, no float arithmetic)
const wax = (n) => (BigInt(n) * 100000000n).toString();
// "1234.56780000 WAX" -> base units as a string, exact at any magnitude
const assetToUnits = (s) => {
  const [int, frac] = s.split(' ')[0].split('.');
  return (BigInt(int) * 100000000n + BigInt((frac || '').padEnd(8, '0'))).toString();
};
const asset = (n) => `${BigInt(n).toString()}.00000000 WAX`;

describe('Treasury reconcile', () => {
  let blockchain;
  let tokenContract;
  let orngContract;

  const ORNG = 'orng.wax';
  const scope = nameToBigInt(ORNG);
  const AUTH = `${ORNG}@active`;

  // Fixture (whole WAX): treasury 1000; dapp1 staked 500 by staker (200 unstaked, pending) and 100
  // by staker2 (30 unstaked, pending); dapp2 staked 50; fee deposits 100 (dapp1) + 40 (dapp2).
  // held = 1790; stakes = 420; unstaking = 230; dapp fees = 140 -> honest pool = 1000.
  const HELD = 1790;
  const POOL = 1000;

  function poolBalance() {
    const rows = orngContract.tables.treasury(scope).getTableRows();
    return rows.length ? String(rows[0].pool_balance) : '0';
  }

  function setPoolBalance(value) {
    orngContract.tables
      .treasury(scope)
      .set(nameToBigInt('treasury'), orngContract.name, { pool_balance: value });
  }

  function setOracleFee(oracle, amount) {
    orngContract.tables
      .balances(scope)
      .set(nameToBigInt(oracle), orngContract.name, { oracle, unpaid: amount });
  }

  function setStakeStats(units) {
    orngContract.tables
      .stakestats(scope)
      .set(nameToBigInt('stakestats'), orngContract.name, { total_stake_amount: units });
  }

  function heldByContract() {
    const rows = tokenContract.tables.accounts(scope).getTableRows();
    const row = rows.find((r) => r.balance.endsWith(' WAX'));
    return row ? assetToUnits(row.balance) : '0';
  }

  before(async () => {
    blockchain = new Blockchain();

    tokenContract = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
    });

    const [staker, staker2, depositor, funder] = blockchain.createAccounts(
      'staker',
      'staker2',
      'depositor',
      'funder',
      'dapp1',
      'dapp2'
    );

    orngContract = blockchain.createAccount({
      name: Name.from(ORNG),
      wasm: fs.readFileSync('./build/wax.orng.wasm'),
      abi: fs.readFileSync('./build/wax.orng.abi', 'utf8'),
      enableInline: true,
    });

    await mintTokens(tokenContract, 'WAX', 8, 1000000000, 100000, [
      staker,
      staker2,
      depositor,
      funder,
    ]);

    // fee_per_call 0.01 WAX, so an in-flight paid request owes 0.01 and an undelivered one 0.005
    await orngContract.actions.configv2(['0.01000000 WAX', 3]).send(AUTH);

    const transfer = (from, qty, memo) =>
      tokenContract.actions.transfer([from, ORNG, qty, memo]).send(`${from}@active`);
    await transfer('funder', asset(1000), 'treasury');
    await transfer('staker', asset(500), 'stake-dapp1');
    await transfer('staker2', asset(100), 'stake-dapp1');
    await transfer('staker', asset(50), 'stake-dapp2');
    await transfer('depositor', asset(100), 'deposit-dapp1');
    await transfer('depositor', asset(40), 'deposit-dapp2');
    await orngContract.actions.unstakeuser(['staker', 'dapp1', asset(200)]).send('staker@active');
    await orngContract.actions.unstakeuser(['staker2', 'dapp1', asset(30)]).send('staker2@active');
  });

  it('fixture: the account holds 1790 WAX, the honest counter is 1000, stakes total 420', () => {
    assert.equal(heldByContract(), wax(HELD));
    assert.equal(poolBalance(), wax(POOL));
    const stats = orngContract.tables.stakestats(scope).getTableRows();
    assert.equal(String(stats[0].total_stake_amount), wax(420));
  });

  it('requires the contract authority', async () => {
    setPoolBalance(wax(6000000));
    await expectToThrow(
      orngContract.actions.reconcile([]).send('staker@active'),
      'missing required authority orng.wax'
    );
    assert.equal(poolBalance(), wax(6000000));
  });

  it('brings an overstated counter down to held minus liabilities', async () => {
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), wax(POOL));
  });

  it('brings an understated counter up as well', async () => {
    setPoolBalance('1');
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), wax(POOL));
  });

  it('is idempotent on an honest counter', async () => {
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), wax(POOL));
  });

  it('finds every pending unstake without being told the scopes', async () => {
    // both dapp1 unstakes (200 + 30) are in the formula: 1790 - 420 - 230 - 140 = 1000
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), wax(POOL));
    // a third pending unstake moves the result by exactly its amount
    await orngContract.actions.unstakeuser(['staker', 'dapp2', asset(10)]).send('staker@active');
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), wax(POOL)); // stake -10, unstaking +10: held unchanged, pool unchanged
    const stats = orngContract.tables.stakestats(scope).getTableRows();
    assert.equal(String(stats[0].total_stake_amount), wax(410));
  });

  it('subtracts the unpaid fees of every oracle', async () => {
    setOracleFee('oracle1', asset(50));
    setOracleFee('oracle2', asset(20));
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), wax(POOL - 70));
    setOracleFee('oracle1', asset(0));
    setOracleFee('oracle2', asset(0));
  });

  it('counts the deferred half fee of paid undelivered requests still inside their deadline', async () => {
    // deadlines are compared with the chain's clock, not the wall clock
    const chainNow = blockchain.timestamp.toMilliseconds();
    const future = new Date(chainNow + 86400 * 1000).toISOString().replace('Z', '');
    const past = new Date(chainNow - 86400 * 1000).toISOString().replace('Z', '');
    const row = (id, free_call, deadline) => ({
      request_id: id,
      dapp: 'dapp1',
      assoc_id: id,
      rnd: '0000000000000000000000000000000000000000000000000000000000000000',
      error_message: 'test',
      oracle_reward_deadline: deadline,
      free_call,
    });
    const table = orngContract.tables.undelivered1(scope);
    table.set(1n, orngContract.name, row(1, false, future)); // owed: 0.005
    table.set(2n, orngContract.name, row(2, false, past)); // expired: not owed
    table.set(3n, orngContract.name, row(3, true, future)); // free call: not owed
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), (BigInt(wax(POOL)) - 500000n).toString());
    // leave the rows but make them inert for the tests below
    table.set(1n, orngContract.name, row(1, false, past));
  });

  it('writes zero when the liabilities exactly equal the balance', async () => {
    setOracleFee('oracle1', asset(POOL));
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), '0');
    setOracleFee('oracle1', asset(0));
  });

  it('fails closed when the liabilities exceed the balance', async () => {
    setOracleFee('oracle1', asset(POOL + 1));
    setPoolBalance(wax(6000000));
    await expectToThrow(
      orngContract.actions.reconcile([]).send(AUTH),
      `eosio_assert_message: WAX held for others (${asset(HELD + 1)} = stakes ${asset(
        410
      )} + unstaking ${asset(240)} + dapp fees ${asset(140)} + oracle fees ${asset(
        POOL + 1
      )} + in-flight fees ${asset(0)}) exceeds the WAX held (${asset(
        HELD
      )}); the account is insolvent and the treasury counter cannot be reconciled`
    );
    assert.equal(poolBalance(), wax(6000000));
    setOracleFee('oracle1', asset(0));
  });

  it('refuses when stakestats disagrees with the acctstate stakes', async () => {
    setStakeStats(wax(2000));
    setPoolBalance(wax(6000000));
    await expectToThrow(
      orngContract.actions.reconcile([]).send(AUTH),
      `eosio_assert_message: stakestats.total_stake_amount (${asset(
        2000
      )}) does not equal the sum of acctstate stakes (${asset(
        410
      )}); fix the stake counter before reconciling the treasury`
    );
    assert.equal(poolBalance(), wax(6000000));
    setStakeStats(wax(410));
    await orngContract.actions.reconcile([]).send(AUTH);
    assert.equal(poolBalance(), wax(POOL));
  });
});
