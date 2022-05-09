const {
  getTypesFromAbi,
  createInitialTypes,
  getType,
} = require('eosjs/dist/eosjs-serialize');

function createAbiSerializer(abi) {
  types = getTypesFromAbi(createInitialTypes(), abi);
  const actions = new Map();
  for (const { name, type } of abi.actions) {
    actions.set(name, getType(types, type));
  }
  const tables = new Map();
  for (const { name, type } of abi.tables) {
    tables.set(name, getType(types, type));
  }
  return { types, actions, tables };
}

module.exports = { createAbiSerializer };
