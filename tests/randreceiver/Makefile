# Makefile for randreceiver test contract

CONTRACT_NAME = randreceiverv2
CONTRACT_FILE = $(CONTRACT_NAME)
CPP_SOURCES = $(CONTRACT_NAME).cpp
INCLUDE_DIRS = -I/usr/local/eosio.cdt/include

DOCKER_DEV_VERSION = v5.0.3wax02-v4.0.1-wax1.0.0
CONTAINER = build-${CONTRACT_NAME}

DOCKER_COMMON = -v `pwd`:`pwd` --name ${CONTAINER} -w `pwd` waxteam/waxdev:${DOCKER_DEV_VERSION}
AS_LOCAL = --user $(shell id -u):$(shell id -g)

# Compiler settings
CXX = cdt-cpp
CXXFLAGS = -abigen -contract=$(CONTRACT_NAME) -O3 $(INCLUDE_DIRS)

# Build directories and files
BUILD_DIR = build

# Output files
WASM_OUTPUT = $(BUILD_DIR)/$(CONTRACT_FILE).wasm
ABI_OUTPUT = $(BUILD_DIR)/$(CONTRACT_FILE).abi

.PHONY: all clean build check_dirs dev-docker-stop dev-docker-start docker-build

all: build

check_dirs:
	@mkdir -p $(BUILD_DIR)

# Build the contract
build: check_dirs
	$(CXX) $(CXXFLAGS) $(CPP_SOURCES) -o $(WASM_OUTPUT)

# Clean build artifacts
clean:
	rm -rf $(BUILD_DIR)

# Docker commands
dev-docker-stop:
	@-docker rm ${CONTAINER}

dev-docker-start: dev-docker-stop
	docker run ${AS_LOCAL} -it ${DOCKER_COMMON} bash -l

docker-build: dev-docker-stop clean
	docker run ${AS_LOCAL} ${DOCKER_COMMON} bash -lc "make build"
