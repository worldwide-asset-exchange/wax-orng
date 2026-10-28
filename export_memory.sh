#!/bin/bash

# Script to export memory for WASM files in the build and tests/contracts folders using Docker
# This adds (export "memory") to the WASM memory declaration

set -e

# Docker configuration
DOCKER_IMAGE="waxteam/cdt:ce-v1.0.3wax01-v4.1.1wax01"
BUILD_DIR="./build"
TESTS_DIR="./tests/contracts"

# Check if at least one directory exists and has WASM files
has_build=false
has_tests=false

if [ -d "$BUILD_DIR" ] && ls "$BUILD_DIR"/*.wasm 1> /dev/null 2>&1; then
    has_build=true
fi

if [ -d "$TESTS_DIR" ] && ls "$TESTS_DIR"/*.wasm 1> /dev/null 2>&1; then
    has_tests=true
fi

if [ "$has_build" = false ] && [ "$has_tests" = false ]; then
    echo "Error: No WASM files found in $BUILD_DIR or $TESTS_DIR"
    exit 1
fi

echo "Running memory export in Docker container..."

docker run --rm \
    -v "$(pwd):/work" \
    -w /work \
    "$DOCKER_IMAGE" \
    bash -c '
        echo "Installing wabt..." && \
        apt-get update -qq && apt-get install -y -qq wabt && \

        export_memory() {
            local wasm_file=$1
            echo "Exporting memory for $wasm_file..."
            wasm2wat $wasm_file | sed -e "s|(memory |(memory (export \"memory\") |" > ${wasm_file}.tmp.wat && \
            wat2wasm -o $wasm_file ${wasm_file}.tmp.wat && \
            rm ${wasm_file}.tmp.wat && \
            echo "✓ Memory exported successfully for $wasm_file"
        }

        # Enable nullglob to handle directories with no WASM files
        shopt -s nullglob

        # Process all WASM files in build directory
        for wasm_file in build/*.wasm; do
            if [ -f "$wasm_file" ]; then
                export_memory "$wasm_file"
            fi
        done

        # Process all WASM files in tests/contracts directory
        # for wasm_file in tests/contracts/*.wasm; do
        #     if [ -f "$wasm_file" ]; then
        #         export_memory "$wasm_file"
        #     fi
        # done

        echo ""
        echo "All WASM files processed successfully!"
    '
