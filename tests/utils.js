const crypto = require('crypto');

function stringHashToNum(str) {
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    let bytes = str.slice(i * 2, i * 2 + 2);
    const a = parseInt(bytes, 16) & 127;
    result = (result << BigInt(8)) + BigInt(a);
  }
  return result.toString();
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function findResolerOfEpoch(epoch, numberOfResolver) {
  let resolvers = [];
  const numberOfActiveNode = epoch.active_nodes.length;

  const seedHashInput = epoch.seeds.join('');
  const finalSeed = crypto.createHash('sha256').update(seedHashInput, 'hex').digest('hex');

  while(resolvers.length < numberOfResolver) {
    for (let i = 0; i< 32; i++) {
      const resolverIndex = Number('0x' + finalSeed.slice(2*i, 2*i + 2)) % numberOfActiveNode;
      if (!resolvers.find((r) => r === epoch.active_nodes[resolverIndex])) {
        resolvers.push(epoch.active_nodes[resolverIndex]);
      }

      if (resolvers.length >= numberOfResolver) {
        break;
      }
    }
  }

  return resolvers;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = { stringHashToNum, getRandomInt, findResolerOfEpoch, sleep };