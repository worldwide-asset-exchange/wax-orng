We will using     "@vaulta/vert": "file:./vaulta-vert-2.1.1.tgz" to replace qtest-js as test framework for this contract

## Example usage

import { Blockchain, nameToBigInt, expectToThrow } from "@vaulta/vert";
import { assert } from "chai";

// instantiate the blockchain emulator
const blockchain = new Blockchain()

// Load a contract
const contract = blockchain.createContract(
    // The account to set the contract on
    'accountname', 
    // The path to the contract's wasm/abi
    // both wasm and abi files should be named yourcontract.wasm and yourcontract.abi
    'build/yourcontract' 
)


// You can clear the tables in the 
// contract before each test
beforeEach(async () => {
    blockchain.resetTables()
})

describe('Testing Suite', () => {
    it('should do X', async () => {
        // Create some accounts to work with
        const [alice, bob] = blockchain.createAccounts('alice', 'bob')
        
        // Will call a normal action. 
        // Returns an array of results if the action returns a value (array since inlines can also return values)
        const result = await contract.actions.youraction([param1, param2]).send();
        // You can also specify the authorization for the action
        // .send('alice@active')
        // default is the contract's account itself with 'active' permission
        
        // Will call a normal action, or a readonly action.
        // Returns a return value from the action, or null (no array)
        const readonlyResult = await contract.actions.youraction([param]).read();

        // You can get table data from the contract, though readonly actions 
        // are the preferred way to get data from external sources (web apps, apis, etc)
        const rows = contract.tables.yourtable(
            nameToBigInt('scope')
        ).getTableRow(
            nameToBigInt('primary.key')
        );

        // if you called 'print' in your contract, you can access the console output
        // after the action is executed
        console.log(contract.bc.console);

        // You can verify that an action throws an error
        expectToThrow(
            contract.actions.badaction([]).send(),
            'This will be "some error" from inside check(false, "some error")'
        )
    });
});


### Load an account with abi, wasm:
```
const blockchain = new Blockchain()

const timeName = Name.from('time')
const time = blockchain.createAccount({
  name: timeName,
  wasm: fs.readFileSync(path.join(__dirname, 'timer.wasm')),
  abi: fs.readFileSync(path.join(__dirname, 'timer.abi'), 'utf8')
})

```

### Mint and transfer token:

const { Blockchain, nameToBigInt, mintTokens } = require("@vaulta/vert");
const tokenContract = blockchain.createAccount({
            name: Name.from('eosio.token'),
            wasm: fs.readFileSync('./tests/fixtures/eosio.token/eosio.token.wasm'),
            abi: fs.readFileSync('./tests/fixtures/eosio.token/eosio.token.abi', 'utf8'),
        });

        await mintTokens(tokenContract, 'WAX', 8, 1000000000, 10000, [user1]);

 // Transfer WAX with deposit memo
        await tokenContract.actions.transfer([
            user1.name.toString(),
            atomicassets.name.toString(),
            '10.00000000 WAX',
            'deposit'
        ]).send(`${user1.name.toString()}@active`);

### Time
- blockchain has 2 function: 

 public setTime (time: TimePoint | TimePointSec)
 public addTime (time: TimePoint | TimePointSec) 
 we can use addTime to increase blockchain time
 