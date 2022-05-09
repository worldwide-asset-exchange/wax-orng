const fs = require('fs');
const { SerialBuffer } = require('eosjs/dist/eosjs-serialize');
const { Contract } = require('./contract');
const { eosjs, TESTING_PUBLIC_KEY, dedupeTapos } = require('./config');

/**
 * Create an account on the blockchain
 *
 * @param {string} account accouunt name to generate
 * @param {Number=} bytes number of RAM bytes to initialize the account with. Default 1000000
 * @return {Promise<TransactionReceipt>} transaction receipt
 * @api public
 */
function createAccount(account, bytes = 1000000) {
  return eosjs.api.transact(
    {
      actions: [
        {
          account: 'eosio',
          name: 'newaccount',
          authorization: [
            {
              actor: 'eosio',
              permission: 'active',
            },
          ],
          data: {
            creator: 'eosio',
            name: account,
            owner: {
              threshold: 1,
              keys: [
                {
                  key: TESTING_PUBLIC_KEY,
                  weight: 1,
                },
              ],
              accounts: [],
              waits: [],
            },
            active: {
              threshold: 1,
              keys: [
                {
                  key: TESTING_PUBLIC_KEY,
                  weight: 1,
                },
              ],
              accounts: [],
              waits: [],
            },
          },
        },
        {
          account: 'eosio',
          name: 'buyrambytes',
          authorization: [
            {
              actor: 'eosio',
              permission: 'active',
            },
          ],
          data: {
            payer: 'eosio',
            receiver: account,
            bytes,
          },
        },
        {
          account: 'eosio',
          name: 'delegatebw',
          authorization: [
            {
              actor: 'eosio',
              permission: 'active',
            },
          ],
          data: {
            from: 'eosio',
            receiver: account,
            stake_net_quantity: '10.00000000 WAX',
            stake_cpu_quantity: '10.00000000 WAX',
            transfer: 0,
          },
        },
      ],
    },
    dedupeTapos()
  );
}

/**
 * Set a contract on a blockchain account
 *
 * @param {string} account accouunt to set the contract on
 * @param {string} wasmFile wasm file path to set
 * @param {string} abiFile abi file path to set
 * @return {Promise<Contract>} contract instance
 * @api public
 */
async function setContract(account, wasmFile, abiFile) {
  const buffer = new SerialBuffer({
    textEncoder: eosjs.api.textEncoder,
    textDecoder: eosjs.api.textDecoder,
  });

  let abiJSON = JSON.parse(fs.readFileSync(abiFile, 'utf8'));
  const abiDefinitions = eosjs.api.abiTypes.get('abi_def');

  abiJSON = abiDefinitions.fields.reduce(
    (acc, { name: fieldName }) =>
      Object.assign(acc, { [fieldName]: acc[fieldName] || [] }),
    abiJSON
  );
  abiDefinitions.serialize(buffer, abiJSON);
  serializedAbiHexString = Buffer.from(buffer.asUint8Array()).toString('hex');

  const wasmHexString = fs.readFileSync(wasmFile).toString('hex');

  const tx = await eosjs.api.transact(
    {
      actions: [
        {
          account: 'eosio',
          name: 'setcode',
          authorization: [
            {
              actor: account,
              permission: 'active',
            },
          ],
          data: {
            account,
            vmtype: 0,
            vmversion: 0,
            code: wasmHexString,
          },
        },
        {
          account: 'eosio',
          name: 'setabi',
          authorization: [
            {
              actor: account,
              permission: 'active',
            },
          ],
          data: {
            account,
            abi: serializedAbiHexString,
          },
        },
      ],
    },
    dedupeTapos()
  );

  return new Contract(account, wasmFile, abiJSON, tx);
}

/**
 * Update permissions and keys on an account
 *
 * @param {string} account accouunt to update
 * @param {string} permission permission to affect. Ex. 'active'
 * @param {string} parent parent of the above permission. Ex. 'owner'
 * @return {Promise<TransactionReceipt>} transaction receipt
 * @api public
 */
function updateAuth(account, permission, parent, auth) {
  return eosjs.api.transact(
    {
      actions: [
        {
          account: 'eosio',
          name: 'updateauth',
          authorization: [
            {
              actor: account,
              permission: parent || 'owner',
            },
          ],
          data: {
            account,
            permission,
            parent,
            auth,
          },
        },
      ],
    },
    dedupeTapos()
  );
}

/**
 * Link actions to an account permission
 *
 * @param {string} account accouunt to update
 * @param {string} requirement permission required
 * @param {string} permission contract to associate
 * @param {string} type action to assocate on the code above
 * @return {Promise<TransactionReceipt>} transaction receipt
 * @api public
 */
function linkauth(account, requirement, code, type) {
  return eosjs.api.transact(
    {
      actions: [
        {
          account: 'eosio',
          name: 'linkauth',
          authorization: [
            {
              actor: account,
              permission: 'active',
            },
          ],
          data: {
            account,
            requirement,
            code,
            type,
          },
        },
      ],
    },
    dedupeTapos()
  );
}

/**
 * Transfer WAX
 *
 * @param {string} from accouunt to send from
 * @param {string} to account to send to
 * @param {string} quantity amount of WAX to send. Ex: '1.00000000 WAX'
 * @param {string} memo arbitrary message
 * @return {Promise<TransactionReceipt>} transaction receipt
 * @api public
 */
function transfer(from, to, quantity, memo) {
  return genericAction(
    'eosio.token',
    'transfer',
    {
      from,
      to,
      quantity,
      memo,
    },
    [
      {
        actor: from,
        permission: 'active',
      },
    ]
  );
}

/**
 * Get rows from a smart contract table
 *
 * @param {string} code contract account to query
 * @param {string} table table in the contract to query
 * @param {string} scope scope for the table
 * @param {Number=} limit max rows to return. Default 100
 * @return {Promise<Array>} array of table entries
 * @api public
 */
async function getTableRows(code, table, scope, limit = 100) {
  const res = await eosjs.rpc.get_table_rows({
    json: true,
    code,
    scope,
    table,
    limit,
    reverse: false,
    show_payer: false,
  });
  return res.rows;
}

/**
 * Run a generic blockchain action
 *
 * @param {string} account contract account
 * @param {string} name action to fire
 * @param {Object} data action data json
 * @param {Authorization} authorization authorization object. Ie the actor executing the action
 * @return {Promise<authorization>} transaction receipt
 * @api public
 */
function genericAction(account, name, data, authorization) {
  return eosjs.api.transact(
    {
      actions: [
        {
          account,
          name,
          authorization,
          data,
        },
      ],
    },
    dedupeTapos()
  );
}

module.exports = {
  createAccount,
  setContract,
  updateAuth,
  linkauth,
  getTableRows,
  transfer,
  genericAction,
  dedupeTapos,
};
