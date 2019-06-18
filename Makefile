# Copyright (c) 2019, The WAX Team and respective Authors, all rights reserved.
#
# The MIT License
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

CONTRACT_NAME = $(shell scripts/get_contract_name.sh)
CONTRACT_VERSION = $(shell scripts/get_version.sh)
CONTRACT_ACCOUNT = ${CONTRACT_NAME}.wax
CONTRACT_DIR = wax-${CONTRACT_NAME}
CONTRACT_FILE = wax.${CONTRACT_NAME}
BLOCKCHAIN_VERSION = wax-1.6.1-1.0.0

.PHONY:info
info:
	$(info Name:           ${CONTRACT_NAME})
	$(info Version:        ${CONTRACT_VERSION})
	$(info Account:        ${CONTRACT_ACCOUNT})
	$(info Directory:      ${CONTRACT_DIR})
	$(info Base file:      ${CONTRACT_FILE})
	$(info Blockchain ver: ${BLOCKCHAIN_VERSION})
	@echo

.PHONY:dev-docker-stop
dev-docker-stop:
	@-docker rm -f ${CONTRACT_DIR}-development

.PHONY:dev-docker-start
dev-docker-start: dev-docker-stop
	$(info *** Ignore messages about inexistent group and no name in prompt ***)
	docker run --user $(shell id -u):$(shell id -g) -it -v `pwd`:/opt/${CONTRACT_DIR} --name ${CONTRACT_DIR}-development -w /opt/${CONTRACT_DIR} waxteam/dev:${BLOCKCHAIN_VERSION} bash

# Intended for CI
docker-test: dev-docker-stop
	docker run --user $(shell id -u):$(shell id -g) -it -v `pwd`:/opt/${CONTRACT_DIR} --name ${CONTRACT_DIR}-development -w /opt/${CONTRACT_DIR} waxteam/dev:${BLOCKCHAIN_VERSION} bash -c "make all"

.PHONY: prepare_cmake
prepare-cmake:
	@mkdir -p build
	@cd build && if [ ! -e Makefile ]; then cmake ..; fi

.PHONY: clean
clean:
	-rm -rf build

.PHONY: test
test:
	cd build && CTEST_OUTPUT_ON_FAILURE=1 make test

.PHONY: build
build:  prepare-cmake
	cd build && make -j $(shell nproc)

.PHONY: all
all: build test
	
