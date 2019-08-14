# MIT License
# 
# Copyright (c) 2019 worldwide-asset-exchange
# 
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

cmake_minimum_required(VERSION 3.9)

project(utests)

find_package(eosio REQUIRED)

# Was WAX_CONTRACTS_DIR set from command line or env.variable? (cmake -D WAX_CONTRACTS_DIR=<directory> ..)
if ("${WAX_CONTRACTS_DIR}" STREQUAL "")
    if ("$ENV{WAX_CONTRACTS_DIR}" STREQUAL "")
        # Default directory (tests/contracts)
        set(WAX_CONTRACTS_DIR ${PROJECT_SOURCE_DIR}/contracts)
    else()
        set(WAX_CONTRACTS_DIR $ENV{WAX_CONTRACTS_DIR})
    endif()
endif()

if ("${CONTRACT_NAME}" STREQUAL "")
    message(FATAL_ERROR "CONTRACT_NAME variable is not set. Use cmake command line for that.") 
endif()

if ("${CONTRACT_DIR}" STREQUAL "")
    message(FATAL_ERROR "CONTRACT_DIR variable is not set. Use cmake command line for that.") 
endif()

message(STATUS "EOSIO version = ${EOSIO_VERSION}")
message(STATUS "WAX dependency contract directory = ${WAX_CONTRACTS_DIR}")
message(STATUS "Contract name = ${CONTRACT_NAME}")
message(STATUS "Contract location = ${CONTRACT_DIR}")

configure_file(
    ${PROJECT_SOURCE_DIR}/src/contract_helpers.hpp.in
    ${PROJECT_BINARY_DIR}/contract_helpers.hpp)

set(TEST_SOURCES
    src/main.cpp
    src/pause_tests.cpp
    src/version_tests.cpp
    src/setsigpubkey_tests.cpp
    src/requestrand_tests.cpp
    src/setrand_tests.cpp
    src/killjobs_tests.cpp
    src/autoindex_tests.cpp)
    
add_eosio_test(${PROJECT_NAME} ${TEST_SOURCES})

target_include_directories(${PROJECT_NAME} PUBLIC ${PROJECT_BINARY_DIR} ${CONTRACT_DIR})
target_compile_definitions(${PROJECT_NAME} PUBLIC WAX_TEST=1)
