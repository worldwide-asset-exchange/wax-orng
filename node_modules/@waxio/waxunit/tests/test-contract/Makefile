SHELL:= /bin/bash

clean:
	-rm -rf build

make-build-dir:
	-mkdir -p ./build

build: clean make-build-dir
	eosio-cpp ./src/testcontract.cpp -o build/testcontract.wasm  -I ./include/ -abigen_output build/testcontract.abi
