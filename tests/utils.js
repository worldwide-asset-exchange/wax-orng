const crypto = require('crypto');
const fs = require('fs');
const { RSASigning } = require('./rsaSigning.js');

const ORACLE_MODE = 0;
const DECENTRALIZE_MODE = 1;

let signingKey = [];

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
  const validSeeds = epoch.seeds.filter(s => s.signature !== "");
  const numberOfActiveNode = validSeeds.length;

  const seedHashInput = validSeeds.map(s => s.signature).join('');
  const finalSeed = crypto.createHash('sha256').update(seedHashInput, 'hex').digest('hex');

  let offset = 0;
  while(resolvers.length < numberOfResolver) {
    for (let i = 0; i< 32; i++) {
      const resolverIndex = (Number('0x' + finalSeed.slice(2*i, 2*i + 2)) + offset) % numberOfActiveNode;
      if (!resolvers.find((r) => r === validSeeds[resolverIndex].node)) {
        resolvers.push(validSeeds[resolverIndex].node);
      }

      if (resolvers.length == numberOfResolver) {
        break;
      }
    }
    offset++;
  }

  return resolvers;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getSigningKey() {
  if (signingKey.length === 0) {
    for (let i = 0; i < 5; i++) {
      const signingPrivateKey = fs.readFileSync(`./tests/resources/test_rsa_4096_priv_${i}.pem`, 'utf8');
      const rsaSigning = new RSASigning(signingPrivateKey);
      const signingPrivateKey1 = fs.readFileSync(`./tests/resources/test_rsa_4096_priv_${i}1.pem`, 'utf8');
      const rsaSigning1 = new RSASigning(signingPrivateKey1);
      signingKey.push(
        {
          exponent: rsaSigning.key.keyPair.e.toString(16),
          modulus: rsaSigning.key.keyPair.n.toString(16),
          privateKey: signingPrivateKey,
          modulusId: stringHashToNum(crypto.createHash('sha256').update(rsaSigning.key.keyPair.e.toString(16)).digest('hex')),
          exponent1: rsaSigning1.key.keyPair.e.toString(16),
          modulus1: rsaSigning1.key.keyPair.n.toString(16),
          privateKey1: signingPrivateKey1,
          modulusId1: stringHashToNum(crypto.createHash('sha256').update(rsaSigning1.key.keyPair.e.toString(16)).digest('hex'))
        }
      )
    }
  }

  return signingKey;
}

async function nodesPing(orngContract, nodes) {
  let lastTx;
  for (let node of nodes) {
    lastTx = await orngContract.contract.action.nodeping(
      {
        owner: node.name,
        seed: crypto.randomBytes(32).toString('hex'),
      },
      [
        {
          actor: node.name,
          permission: 'active',
        },
      ]
    );
  }
  return lastTx;
}

async function nodesSignature(orngContract, nodes) {
  let epoch_seed_tbl = await orngContract.contract.table['epochseed.a'].get({
    scope: orngContract.name
  });

  let lastTx;
  for (let node of nodes) {
    const nodeName = node.name;
    const nodeId = Number(nodeName.replace('node', '')) - 1;
    const nodeSeed = epoch_seed_tbl.rows[0].seeds.find(s => s.node === nodeName);
    const rsaSigning = new RSASigning(signingKey[nodeId].privateKey);

    const signedValue = rsaSigning.signSeed(
      nodeSeed.seed
    );

    lastTx = await orngContract.contract.action.nodesignature(
      {
        owner: node.name,
        signature: signedValue,
      },
      [
        {
          actor: node.name,
          permission: 'active',
        },
      ]
    );
  }
  return lastTx;
}

async function setupProducer(chain, voter, nodes) {
  for (let node of nodes) {
    await chain.pushAction({
      account: "eosio",
      name: "regproducer",
      authorization: [
          {
              actor: node.name,
              permission: "active",
          },
      ],
      data: {
        producer: node.name,
        producer_key: 'EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV',
        url: "http://url.com",
        location: '',
      },
    });
  }

  await chain.pushAction({
    account: "eosio",
    name: "voteproducer",
    authorization: [
        {
            actor: voter.name,
            permission: "active",
        },
    ],
    data: {
      voter: voter.name,
      proxy: '',
      producers: nodes.map(n => n.name)
    },
  });
}

module.exports = { stringHashToNum, getRandomInt, findResolerOfEpoch, sleep, getSigningKey, ORACLE_MODE, DECENTRALIZE_MODE, nodesPing, nodesSignature, setupProducer };