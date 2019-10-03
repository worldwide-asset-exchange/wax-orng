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
CONTRACT_FILE = wax.${CONTRACT_NAME}

DOCKER_DEV_VERSION = wax-1.6.1-1.2.0

CONTAINER = build-${CONTRACT_NAME}
#WORK_DIR = /opt/${CONTRACT_NAME}

DOCKER_COMMON = -v `pwd`:`pwd` --name ${CONTAINER} -w `pwd` waxteam/dev:${DOCKER_DEV_VERSION}
AS_LOCAL = --user $(shell id -u):$(shell id -g)

.PHONY:info dev-docker-stop dev-docker-start prepare_cmake clean test build all

info:
	$(info Name:           ${CONTRACT_NAME})
	$(info Version:        ${CONTRACT_VERSION})
	$(info Account:        ${CONTRACT_ACCOUNT})
	$(info Base file:      ${CONTRACT_FILE})
	$(info Docker dev.ver: ${DOCKER_DEV_VERSION})
	@echo

dev-docker-stop:
	@-docker rm ${CONTAINER}

dev-docker-start: dev-docker-stop
	$(info *** Ignore messages about inexistent group and no name in prompt ***)
	docker run ${AS_LOCAL} -it ${DOCKER_COMMON} bash -l

# Intended for CI
docker-test: dev-docker-stop
	docker run ${AS_LOCAL} -it ${DOCKER_COMMON} bash -lc "make all"

prepare-cmake:
	@mkdir -p build
	@cd build && if [ ! -e Makefile ]; then cmake ..; fi

clean:
	-rm -rf build

test:
	cd build && CTEST_OUTPUT_ON_FAILURE=1 make test

build:  prepare-cmake
	cd build && make -j $(shell nproc)

all: build test
	
