const vert = require('@waxio/vert');
const { Blockchain, nameToBigInt, expectToThrow, mintTokens } = vert;
const { assert } = require('chai');
const fs = require('fs');
const { Name } = require('@wharfkit/antelope');

// 8-decimal WAX in base units, as a string (vert returns uint64 fields as strings or numbers;
// compare as strings to be safe either way)
const wax = (n) => BigInt(Math.round(n * 1e8)).toString();

describe('Treasury reconcile', () => {
  let blockchain;
  let tokenContract;
  let orngContract;
  let staker;
  let depositor;
  let funder;
  let dapp1;
  let dapp2;

  const ORNG = 'orng.wax';
  const scope = nameToBigInt(ORNG);

  function poolBalance() {
    const rows = orngContract.tables.treasury(scope).getTableRows();
    return rows.length ? String(rows[0].pool_balance) : '0';
  }

  function setPoolBalance(value) {
    orngContract.tables
      .treasury(scope)
      .set(nameToBigInt('treasury'), orngContract.name, { pool_balance: value });
  }

  function heldByContract() {
    const rows = tokenContract.tables.accounts(scope).getTableRows();
    const row = rows.find((r) => r.balance.endsWith(' WAX'));
    return row ? wax(parseFloat(row.balance.split(' ')[0])) : '0';
  }

  before(async () => {
    blockchain = new Blockchain();

    tokenContract = blockchain.createAccount({
      name: Name.from('eosio.token'),
      wasm: fs.readFileSync('./tests/contracts/eosio.token.wasm'),
      abi: fs.readFileSync('./tests/contracts/eosio.token.abi', 'utf8'),
    });

    [staker, depositor, funder, dapp1, dapp2] = blockchain.createAccounts(
      'staker',
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

    await mintTokens(tokenContract, 'WAX', 8, 1000000000, 100000, [staker, depositor, funder]);

    // Treasury: 1000 WAX. The counter is honest at this point.
    await tokenContract.actions
      .transfer(['funder', ORNG, '1000.00000000 WAX', 'treasury'])
      .send('funder@active');
    // Liabilities held in the same account: a 500 WAX stake for dapp1 (200 of it then unstaked and
    // pending), a 100 WAX fee deposit for dapp1, a 50 WAX stake for dapp2.
    await tokenContract.actions
      .transfer(['staker', ORNG, '500.00000000 WAX', 'stake-dapp1'])
      .send('staker@active');
    await tokenContract.actions
      .transfer(['depositor', ORNG, '100.00000000 WAX', 'deposit-dapp1'])
      .send('depositor@active');
    await tokenContract.actions
      .transfer(['staker', ORNG, '50.00000000 WAX', 'stake-dapp2'])
      .send('staker@active');
    await orngContract.actions
      .unstakeuser(['staker', 'dapp1', '200.00000000 WAX'])
      .send('staker@active');
  });

  it('fixture: the account holds 1650 WAX, the counter says 1000', () => {
    assert.equal(heldByContract(), wax(1650));
    assert.equal(poolBalance(), wax(1000));
    const stats = orngContract.tables.stakestats(scope).getTableRows();
    assert.equal(String(stats[0].total_stake_amount), wax(350)); // 500 - 200 + 50
  });

  it('refuses when the counter already equals held minus liabilities', async () => {
    // 1650 - (350 staked + 200 unstaking + 100 fee deposit) = 1000 = the honest counter
    await expectToThrow(
      orngContract.actions.reconcile([['dapp1']]).send(`${ORNG}@active`),
      `eosio_assert_message: pool_balance already equals the WAX held for the treasury (${wax(
        1000
      )}); nothing to reconcile`
    );
  });

  it('requires the contract authority', async () => {
    setPoolBalance(wax(6000000));
    await expectToThrow(
      orngContract.actions.reconcile([['dapp1']]).send('staker@active'),
      'missing required authority orng.wax'
    );
    assert.equal(poolBalance(), wax(6000000));
  });

  it('brings an overstated counter down to held minus liabilities', async () => {
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([['dapp1']]).send(`${ORNG}@active`);
    assert.equal(poolBalance(), wax(1000));
  });

  it('brings an understated counter up as well', async () => {
    setPoolBalance('1');
    await orngContract.actions.reconcile([['dapp1']]).send(`${ORNG}@active`);
    assert.equal(poolBalance(), wax(1000));
  });

  it('counts the pending unstakes only of the dapps listed', async () => {
    // Omitting dapp1 drops the 200 WAX pending unstake from the liabilities: the caller owns the
    // scope list, so the result is higher by exactly that amount.
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([[]]).send(`${ORNG}@active`);
    assert.equal(poolBalance(), wax(1200));
  });

  it('refuses a listed dapp that has no pending unstake', async () => {
    setPoolBalance(wax(6000000));
    await expectToThrow(
      orngContract.actions.reconcile([['dapp1', 'dapp2']]).send(`${ORNG}@active`),
      'eosio_assert_message: no pending unstake for dapp2; list only dapps that have rows in the unstake table'
    );
  });

  it('refuses a dapp listed twice', async () => {
    await expectToThrow(
      orngContract.actions.reconcile([['dapp1', 'dapp1']]).send(`${ORNG}@active`),
      'eosio_assert_message: unstake_dapps lists dapp1 twice'
    );
  });

  it('subtracts oracle unpaid fees', async () => {
    orngContract.tables.balances(scope).set(nameToBigInt('oracle1'), orngContract.name, {
      oracle: 'oracle1',
      unpaid: '50.00000000 WAX',
    });
    setPoolBalance(wax(6000000));
    await orngContract.actions.reconcile([['dapp1']]).send(`${ORNG}@active`);
    assert.equal(poolBalance(), wax(950));
    // vert table views cannot delete a row; zero it so later tests see no oracle fees
    orngContract.tables.balances(scope).set(nameToBigInt('oracle1'), orngContract.name, {
      oracle: 'oracle1',
      unpaid: '0.00000000 WAX',
    });
  });

  it('fails closed when the liabilities exceed the balance', async () => {
    orngContract.tables
      .stakestats(scope)
      .set(nameToBigInt('stakestats'), orngContract.name, { total_stake_amount: wax(2000) });
    setPoolBalance(wax(6000000));
    await expectToThrow(
      orngContract.actions.reconcile([['dapp1']]).send(`${ORNG}@active`),
      `eosio_assert_message: WAX held for others (${wax(2300)} = stakes ${wax(
        2000
      )} + unstaking ${wax(200)} + dapp fees ${wax(
        100
      )} + oracle fees 0) exceeds the WAX held (${wax(
        1650
      )}); the account is insolvent and the treasury counter cannot be reconciled`
    );
    assert.equal(poolBalance(), wax(6000000));
    orngContract.tables
      .stakestats(scope)
      .set(nameToBigInt('stakestats'), orngContract.name, { total_stake_amount: wax(350) });
  });
});
