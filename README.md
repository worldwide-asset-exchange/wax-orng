## The WAX RNG Native Blockchain Service

- Is open source and is a blockchain-native service that developers can easily integrate into their dApps.
- Is based on the [Signidice algorithm](https://github.com/gluk256/misc/blob/master/rng4ethereum/signidice.md) and RSA verification. Signidice was chosen for its excellent randomization and non-gameablity characteristics, in addition to yielding a cleaner workflow for dApp developers and being provably fair. RSA verification ensures uniqueness of the signature and removes the ability for the results to be manipulated (if any other type of signing algorithm were used, it would allow many valid signatures for the same signing_value which could result in manipulation).
- Can easily be established as provably fair. The self-verifying WAX RNG Native Blockchain Service confirms that the RSA signature that comes back from the WAX RNG oracle is valid and authentic before being utilized by the dApp. When dApp customers can easily establish fairness, they have a higher degree of confidence in using the dApp.

For more information, check out the WAX [blog](https://wax.io/blog/how-the-wax-rng-smart-contract-solves-common-problems-for-dapp-developers).

### Building the smart contract and its unit tests

- Requirements
    - docker, installed and configured to run without sudo
    - make
      
- Build and test
    ```console

    # Start the development docker
    make dev-docker-start

    # Build the smart contract and unit tests
    make build

    # Run tests
    make test
    
    # Optional, build and test
    make all

    # Clean all and exit
    make clean
    exit
    ```

### License
[MIT](https://github.com/worldwide-asset-exchange/wax-orng/blob/master/LICENSE)
