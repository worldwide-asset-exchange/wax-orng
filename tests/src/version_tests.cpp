// MIT License
// 
// Copyright (c) 2019 worldwide-asset-exchange
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

#include "wax_fixture.hpp"
#include "contract_info.hpp"

#include <ostream>
#include <cstdint>

using namespace wax;
using namespace contract_info;

BOOST_AUTO_TEST_SUITE(version_tests)

struct version_fixture: public wax_fixture {
    auto get_version_from_cfg(wax::name account = wax::contract_info::account_n) {
        return static_cast<std::uint64_t>(get_config_value(N(version), account, account));
    }
 
}; // struct version_fixture


BOOST_AUTO_TEST_CASE(validate_int_and_str_values) {
    static_assert(
        sizeof(version::int_value) == sizeof(std::uint64_t),
        "Invalid version type, expected uint64");

    std::ostringstream version_from_int_value;

    version_from_int_value
        << (version::int_value >> 48 & 0xffff) << '.'
        << (version::int_value >> 32 & 0xffff) << '.'
        << (version::int_value >> 16 & 0xffff) << '.'
        << (version::int_value       & 0xffff);

    BOOST_REQUIRE_EQUAL(version_from_int_value.str(), version::cstr_value);
}

BOOST_FIXTURE_TEST_CASE(check_contract_version_api, version_fixture) {
    try {
        BOOST_TEST_MESSAGE("Test contract version = " << version::cstr_value);
        
        // First case/attempt: table is empty, value will be set into the table
        action_version();
        BOOST_REQUIRE_EQUAL(version::int_value, get_version_from_cfg());
         
        produce_block();
        
        // Second case/attempt: table is not empty and the contract version is the
        // same as the stored value. 
        BOOST_REQUIRE_THROW(action_version(), eosio_assert_message_exception);
        
    
        /// @todo A 3er test case is needed: when the contract has a new version
        ///       and the table still has the old one (a modification is performed 
        ///       without and assertion..
    }
    FC_LOG_AND_RETHROW();
}

BOOST_AUTO_TEST_SUITE_END()
