# Copyright (c) 2019, The WAX Team and respective Authors, all rights reserved.
#
# The MIT License

CONTRACT_NAME = $(shell scripts/get_contract_name.sh)
CONTRACT_VERSION = $(shell scripts/get_version.sh)
CONTRACT_ACCOUNT = ${CONTRACT_NAME}.wax
CONTRACT_FILE = wax.${CONTRACT_NAME}
CPP_SOURCES = src/${CONTRACT_NAME}.cpp
INCLUDE_DIRS = -I./include -I/usr/local/eosio.cdt/include

DOCKER_DEV_VERSION = v5.0.3wax02-v4.0.1-wax1.0.0
CONTAINER = build-${CONTRACT_NAME}

DOCKER_COMMON = -v `pwd`:`pwd` --name ${CONTAINER} -w `pwd` waxteam/waxdev:${DOCKER_DEV_VERSION}
AS_LOCAL = --user $(shell id -u):$(shell id -g)

# Compiler settings
CXX = cdt-cpp
CXXFLAGS = -abigen -contract=$(CONTRACT_NAME) -O3 $(INCLUDE_DIRS)

# Build directories and files
BUILD_DIR = build
SOURCE_DIR = src
INCLUDE_DIR = include
CONTRACT_INFO_TEMPLATE = $(INCLUDE_DIR)/contract_info.hpp.in
CONTRACT_INFO_OUTPUT = $(INCLUDE_DIR)/contract_info.hpp

# Output files
WASM_OUTPUT = $(BUILD_DIR)/$(CONTRACT_FILE).wasm
ABI_OUTPUT = $(BUILD_DIR)/$(CONTRACT_FILE).abi

.PHONY: all clean build test deploy info contract_info check_template check_dirs

all: build

check_dirs:
	@mkdir -p $(BUILD_DIR)

check_template:
	@if [ ! -f $(CONTRACT_INFO_TEMPLATE) ]; then \
		echo "Error: $(CONTRACT_INFO_TEMPLATE) not found"; \
		echo "Please make sure the template file exists in $(INCLUDE_DIR)"; \
		exit 1; \
	fi

# Build the contract
build: check_dirs contract_info
	$(CXX) $(CXXFLAGS) $(CPP_SOURCES) -o $(WASM_OUTPUT)

# Clean build artifacts
clean:
	rm -rf $(BUILD_DIR)

# Test target (can be expanded later)
test:
	@echo "Running tests..."
	npm test

# Deploy to testnet
deploy-testnet: build
	cleos -u https://testnet.wax.pink.gg set contract $(CONTRACT_NAME) $(BUILD_DIR) $(WASM_OUTPUT) $(ABI_OUTPUT)

# Deploy to mainnet
deploy-mainnet: build
	cleos -u https://wax.greymass.com set contract $(CONTRACT_NAME).wax $(BUILD_DIR) $(WASM_OUTPUT) $(ABI_OUTPUT) -p $(CONTRACT_NAME).wax@deploy

# Generate contract_info.hpp from template
contract_info: check_template check_dirs
	@echo "Generating $(CONTRACT_INFO_OUTPUT) from template..."
	@sed \
		-e 's/$${PROJECT_NAME}/$(CONTRACT_NAME)/g' \
		-e 's/$${PROJECT_VERSION_MAJOR}/$(word 1,$(subst ., ,$(CONTRACT_VERSION)))/g' \
		-e 's/$${PROJECT_VERSION_MINOR}/$(word 2,$(subst ., ,$(CONTRACT_VERSION)))/g' \
		-e 's/$${PROJECT_VERSION_PATCH}/$(word 3,$(subst ., ,$(CONTRACT_VERSION)))/g' \
		-e 's/$${PROJECT_VERSION_TWEAK}/$(word 4,$(subst ., ,$(CONTRACT_VERSION)))/g' \
		$(CONTRACT_INFO_TEMPLATE) > $(CONTRACT_INFO_OUTPUT)

info:
	$(info Name:           ${CONTRACT_NAME})
	$(info Version:        ${CONTRACT_VERSION})
	$(info Account:        ${CONTRACT_ACCOUNT})
	$(info Base file:      ${CONTRACT_FILE})
	$(info Docker dev.ver: ${DOCKER_DEV_VERSION})
	@echo

# Docker commands
dev-docker-stop:
	@-docker rm ${CONTAINER}

dev-docker-start: dev-docker-stop
	docker run ${AS_LOCAL} -it ${DOCKER_COMMON} bash -l

docker-build: dev-docker-stop clean
	docker run ${AS_LOCAL} -it ${DOCKER_COMMON} bash -lc "make build"