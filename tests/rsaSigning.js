const NodeRSA = require('node-rsa');
const Int64 = require('int64-buffer');
const eosjsAccountName = require('eosjs-account-name');
const crypto = require('crypto');
class RSASigning {
  constructor(privateKey) {
    this.key = new NodeRSA(privateKey);
  }

  encodeNumber(numberToEncode) {
    let big = new Int64.Int64LE(numberToEncode);
    return big.toBuffer();
  }

  generateRandomNumber(signing_value) {
    if (!signing_value && signing_value !== 0) {
      throw new Error('Unable to sign an empty transactionId.');
    }
    return this.key.sign(this.encodeNumber(signing_value), 'hex');
  }
}


function make_msg(seedHex, dappName, nonce) {
  const seedBuf = Buffer.from(seedHex, 'hex');

  const nameValue = eosjsAccountName.nameToUint64(dappName);

  const nameBuf = Buffer.alloc(8);
  nameBuf.writeBigUInt64LE(BigInt(nameValue));
  const nBuf = Buffer.alloc(8);
  nBuf.writeBigUInt64LE(BigInt(nonce));
  const finalBuf = Buffer.concat([seedBuf, nameBuf, nBuf]);
  console.log("seedBuf", seedBuf.toString('hex'));
  console.log("nameBuf", nameBuf.toString('hex'));
  console.log("nBuf", nBuf.toString('hex'));
  console.log("finalBuf", finalBuf.toString('hex'));
  const hash = crypto.createHash('sha256').update(finalBuf).digest('hex');
  console.log("hash", hash);
  return hash;
}

module.exports = {
  RSASigning,
  make_msg,
};
