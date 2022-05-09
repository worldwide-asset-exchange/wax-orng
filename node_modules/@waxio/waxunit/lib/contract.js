const fs = require('fs');
const { TextEncoder, TextDecoder } = require('util');
const { SerialBuffer } = require('eosjs/dist/eosjs-serialize');
const { createAbiSerializer } = require('./serializer');
const { eosjs, dedupeTapos } = require('./config');

/**
 * Contract
 * @class Contract
 */
class Contract {
  constructor(account, wasm, abi, tx) {
    this.wasm = wasm;
    this.abi = abi;
    this.tx = tx;
    this.account = account;
    this.abiSerializer = createAbiSerializer(abi);
  }

  /**
   * load data to contract table
   *
   * @param {string} tableName table name
   * @param {Object} scopeRowsData scope and rows data
   * @example
   * {
   *   scope: [{
   *      id: 1,
   *      name: "daniel111111"
   *   }]
   * }
   * @api public
   */
  loadTable(tableName, scopeRowsData) {
    const table = this.abiSerializer.tables.get(tableName);
    if (!table) {
      throw new Error('tableName does not exist in contract');
    }
    const actionData = [];
    for (const scope in scopeRowsData) {
      for (const rows of scopeRowsData[scope]) {
        const buffer = new SerialBuffer({
          textEncoder: new TextEncoder(),
          textDecoder: new TextDecoder(),
        });
        table.serialize(buffer, rows);
        actionData.push({
          table_name: tableName,
          scope,
          row_data: buffer.asUint8Array(),
        });
      }
    }

    return this.call(
      'waxload',
      [
        {
          actor: 'eosio',
          permission: 'active',
        },
      ],
      {
        payload: actionData,
      }
    );
  }

  /**
   * Load data to contract table from file
   *
   * @param {string} tableName table name
   * @param {string} filePath path to json file
   * @api public
   */
  loadTableFromFile(tableName, filePath) {
    const rawdata = fs.readFileSync(filePath);
    const scopeRowsData = JSON.parse(rawdata);
    return this.loadTable(tableName, scopeRowsData);
  }

  /**
   * Call action of contract
   *
   * @param {string} actionName action name
   * @param {Object} permission permission to call
   * @param {Object} data data input to action
   * @api public
   */
  call(actionName, permission, data) {
    return eosjs.api.transact(
      {
        actions: [
          {
            account: this.account,
            name: actionName,
            authorization: permission,
            data,
          },
        ],
      },
      dedupeTapos()
    );
  }
}

module.exports = { Contract };
