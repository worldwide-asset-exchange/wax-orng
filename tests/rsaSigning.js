const NodeRSA = require('node-rsa');
const Int64 = require('int64-buffer');

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
    };
}

module.exports = {
    RSASigning
}