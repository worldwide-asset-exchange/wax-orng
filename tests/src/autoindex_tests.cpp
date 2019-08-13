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

using namespace wax;

//using perm_vec_t = std::vector<permission_level>;
using contract_info::account_n;

BOOST_AUTO_TEST_SUITE(autoindex_tests)

struct autoindex_fixture: public wax_fixture {
    const uint64_t entry_name{uint64_t("jobid.index")};
};

BOOST_FIXTURE_TEST_CASE(happy_path, autoindex_fixture) {
    try {
        constexpr uint64_t signing_value = 1000; // any value

        //auto index_val = get_config_value(entry_name);
        //BOOST_TEST_MESSAGE("index_val: " << index_val);

        action_requestrand(1, signing_value, somecaller_n);
        produce_block();

        auto job = get_jobs_entry(0);
        BOOST_REQUIRE_EQUAL(job.id, 0);
        BOOST_REQUIRE_EQUAL(job.assoc_id, 1);
        BOOST_REQUIRE_EQUAL(job.signing_value, signing_value);

        auto index_val = get_config_value(entry_name);
        BOOST_TEST_MESSAGE("index_val: " << index_val);
    }
    FC_LOG_AND_RETHROW();
}

BOOST_AUTO_TEST_SUITE_END()
