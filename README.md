## The WAX RNG Native Blockchain Service

- Is open source and is a blockchain-native service that developers can easily integrate into their dApps.
- Is based on the [Signidice algorithm](https://github.com/gluk256/misc/blob/master/rng4ethereum/signidice.md) and RSA verification. Signidice was chosen for its excellent randomization and non-gameablity characteristics, in addition to yielding a cleaner workflow for dApp developers and being provably fair. RSA verification ensures uniqueness of the signature and removes the ability for the results to be manipulated (if any other type of signing algorithm were used, it would allow many valid signatures for the same signing_value which could result in manipulation).
- Can easily be established as provably fair. The self-verifying WAX RNG Native Blockchain Service confirms that the RSA signature that comes back from the WAX RNG oracle is valid and authentic before being utilized by the dApp. When dApp customers can easily establish fairness, they have a higher degree of confidence in using the dApp.

For more information, check out the WAX [blog](https://medium.com/wax-io/how-the-wax-rng-native-blockchain-service-solves-common-problems-for-dapp-developers-28c414fa1ca9).

### Building the smart contract and its unit tests

- Requirements
    - docker, installed and configured to run without sudo
    - make
      
- Build and test
    ```console

    # Build the smart contract
    make docker-build

    # Run tests
    npm install
    npm run test
    ```

### Register bandwidth payer

WAX RNG allows dapps to pay for their own bandwidth, which can prevent your dapp from losing service during times of high activity on the rng contract. In the future, WAX will reduce the free bandwidth available for dapps, so it is a good idea to migrate to this to ensure your dapp is always up with respect to random number generation.

1. create new permission name `paybw` and delegate it to `oracle.wax@rngops`

```bash
cleos set account permission payer111111 paybw '{"threshold":1,"keys":[],"accounts":[{"permission":{"actor":"oracle.wax","permission":"rngops"},"weight":1}]}' -p payer111111
```

2. Allow `paybw` permission to call `boost.wax` `noop`

```bash
cleos set action permission payer111111 boost.wax noop paybw
```

3. Dapp register for bandwith payer

```bash
cleos push action orng.wax setbwpayer '["dapp11111111", "payer111111"]' -p dapp11111111
```

4. Payer accept to pay bandwidth

```bash
cleos push action orng.wax acceptbwpay '["dapp11111111", "payer111111", true]' -p payer111111
```

### Allow list/Pay bandwidth for multiple contracts

To pay bandwidth for multiple contracts under one bandwdth paying account:

1. Permission your payer account as in steps 1 and 2 in the previous section "Register bandwidth payer"

2. Do multiple `setbwpayer` actions as in the previous section using the same payer account for each. The contract being allowed must make the request 

```bash
cleos push action orng.wax setbwpayer '["dapp1", "payer111111"]' -p dapp1
cleos push action orng.wax setbwpayer '["dapp2", "payer111111"]' -p dapp2
cleos push action orng.wax setbwpayer '["dapp3", "payer111111"]' -p dapp2
```

3. Payer must accept each set bandwidth payer request:

```bash
cleos push action orng.wax acceptbwpay '["dapp1", "payer111111", true]' -p payer111111
cleos push action orng.wax acceptbwpay '["dapp2", "payer111111", true]' -p payer111111
cleos push action orng.wax acceptbwpay '["dapp3", "payer111111", true]' -p payer111111
```

### Register for error messages log

WAX RNG support developer to record error message to smart contract. Dapp need to delegate permission for oracle.wax, and has RAM to pay for store error message.

1. create new permission name `ornglog` and delegate it to `oracle.wax@rngops`

```bash
cleos set account permission dapp11111111 ornglog '{"threshold":1,"keys":[],"accounts":[{"permission":{"actor":"oracle.wax","permission":"rngops"},"weight":1}]}' -p dapp11111111
```

2. Allow `ornglog` permission to call `orng.wax` `dapperror`

```bash
cleos set action permission dapp11111111 orng.wax dapperror ornglog
```

3. Set error log size

Last N error message will be stored on smart contract table

```bash
cleos push action orng.wax seterrorsize '["dapp11111111", 10]' -p dapp11111111
```

4. Check for error message

Check table `errorlog.a` with scope is dapp contract name

```bash
cleos get table orng.wax dapp11111111 errorlog.a
```

### Decentralize

RNG able to run decentralize mode where block producers operate RNG oracle nodes to process random job.
The system will operate in epochs where M pseudo-randomly chosen signers will mutually sign each random value request during the epoch in which they are assigned. When the epoch ends, another pseudo-randomly chosen set of M signers will take over, and so on. The selection of M signers will be deterministic, based on the initial seeds provided by all N signers.

The configuration for decentralized mode is store in `decentral.a` table:

```bash
$ cleos get table orng.wax orng.wax decentral.a
{
  "rows": [{
      "epoch_duration": 60, 
      "number_of_resolver": 1,
      "number_of_seed": 1,
      "min_active_node": 3,
      "total_reward": 0,
      "total_processed_jobs": 0
    }
  ],
  "more": false,
  "next_key": ""
}
```

- epoch_duration: Duration of each epoch (in seconds)
- number_of_resolver: Number of nodes chosen to act as resolvers each epoch
- number_of_seed: number of resolver seeds require to producer final random hash job
- min_active_node: minimum active nodes required for an epoch to be valid

#### Epoch process

Assumming the current epoch is N, the node process follows these steps:

1. Node setup signing key

- Node has to be top 21 producer
- Node need to setup at least 2 active signing keys to participate in epoch process

```C++
ACTION setnodpubkey(const eosio::name& owner, uint64_t id, const std::string& exponent, const std::string& modulus);
```

- owner: block producer account name
- id: key id
- exponent: key exponent
- modulus: key modulus

2. Submit signature for random job

If a node is chosen as a resolver for epoch N, it must submit a signature for the random job.

```C++
ACTION setranddecen(eosio::name resolver, uint64_t job_id, const std::string& random_value);
```

- resolver: resolver account name
- job_id: job id
- random_value: signature of job seed

3. Ping for epoch N + 2

The node must submit a random hash seed for epoch N + 2

```C++
ACTION nodeping(const eosio::name& owner, eosio::checksum256 seed);
```

- owner: block producer account name
- seed: random hash seed

4. Submit signature for random seed in step 2

The node must submit a signature for the random seed from step 2

```C++
ACTION nodesignature(const eosio::name& owner, const std::string& signature);
```

- owner: bp account name
- signature: signature of seed submit in step 2

5. Execute job

- Once enough signatures are received, the final hash seed is generated and stored in the job table
- The node mush call `executejob` to send the result random hash to the request contract

```C++
ACTION executejob(uint64_t job_id);
```

- job_id: job id to execute

6. Report failed job execution

- If step 5 fails, the node must call the `jobsfail` action to report the failure
- If all resolvers of the current epoch confirm that job failure, the job will be deleted

```C++
ACTION jobsfail(eosio::name resolver, const std::vector<uint64_t>& job_ids);
```

- resolver: resolver account name
- job_ids: list of failed job IDs


### License
[MIT](https://github.com/worldwide-asset-exchange/wax-orng/blob/master/LICENSE)
