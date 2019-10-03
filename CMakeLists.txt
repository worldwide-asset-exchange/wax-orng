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

project(orng VERSION 1.3.0.0)

list(APPEND CMAKE_MODULE_PATH "${PROJECT_SOURCE_DIR}/CMakeModules")
include(WaxHelpers)
find_package(eosio.cdt REQUIRED) 

message(STATUS "Contract version = ${PROJECT_VERSION}")

configure_file(
    include/contract_info.hpp.in
    ${PROJECT_BINARY_DIR}/contract_info.hpp)

set(CONTRACT_SOURCES src/orng.cpp)

set(BASE_TARGET_NAME wax.${PROJECT_NAME})

add_contract(${PROJECT_NAME} ${BASE_TARGET_NAME} ${CONTRACT_SOURCES})
target_include_directories(${BASE_TARGET_NAME}.wasm PUBLIC ${PROJECT_BINARY_DIR} ${PROJECT_SOURCE_DIR}/include)

# Unit tests
add_contract(  # CDT doesn't support add_subdirectory :-(
    randreceiver 
    ${BASE_TARGET_NAME}.tests.randreceiver 
    tests/contracts/randreceiver.cpp) 

wax_add_test_subproject(${PROJECT_NAME} ${BASE_TARGET_NAME} tests)

enable_testing()
add_test(AllTests tests/utests --log_level=all)

# Misc
wax_add_linting(${BASE_TARGET_NAME}.wasm src/*.*pp)
wax_add_linting(${BASE_TARGET_NAME}.tests tests/src/*.*pp)
