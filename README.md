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

RNG able to run decentralize mode, operater register, stake and resolve job to get reward.
The system will operate in epochs where M pseudo-randomly chosen signers will mutually sign each random value request during the epoch in which they are assigned. When the epoch ends, another pseudo-randomly chosen set of M signers will take over, and so on. The selection of M signers will be deterministic, based on the initial seeds provided by all N signers.

The configuration of decentralize mode are store in `decentral.a` table:

```bash
$ cleos get table orng.wax orng.wax decentral.a
{
  "rows": [{
      "epoch_duration": 60, 
      "number_of_resolver": 1,
      "node_min_stake": 1000000000,
      "min_active_node": 3,
      "job_fail_threshold": 2,
      "current_epoch_id": 0,
      "total_reward": 0,
      "total_processed_jobs": 0
    }
  ],
  "more": false,
  "next_key": ""
}
```

- epoch_duration: duration of epoch in second
- number_of_resolver: number of node signer required to resolve job
- node_min_stake: minimum stake of each node
- min_active_node: minimum active node to become valid epoch
- job_fail_threshold: number of resolver require to submit jobs fail to erase jobs

1. Register node

```bash
$ cleos push action orng.wax noderegister '["node1"]' -p node1
```

2. Stake for node

```bash
$ cleos transfer eosio node1 "1000.00000000 WAX" "stake" -p eosio
$ cleos get table orng.wax orng.wax node.a
{
  "rows": [{
      "owner": "node1",
      "job_count": 0,
      "staked": "100000000000"
    }
  ],
  "more": false,
  "next_key": ""
}
```

### License
[MIT](https://github.com/worldwide-asset-exchange/wax-orng/blob/master/LICENSE)
