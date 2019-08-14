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
#include <vector>

using namespace wax;
using contract_info::account_n;

BOOST_AUTO_TEST_SUITE(killjobs_tests)

struct killjobs_fixture: public wax_fixture {

    void action_requestrand() {
        static uint64_t unique_signing_value = 0;

        // Any value for all parameters, they are not important
        wax_fixture::action_requestrand(0, unique_signing_value++, somecaller_n);
    }

    bool is_jobs_table_empty() {
        return !find_table(account_n, account_n, N(jobs.a));
    }
};

//
// Note: The assumption for all tests is that "job_id" is zero for the 
//       first row of a new table
// 

BOOST_FIXTURE_TEST_CASE(happy_path, killjobs_fixture) {
    try {
        action_requestrand();

        constexpr uint64_t id = 0;

        auto job = get_jobs_entry(id);
        BOOST_REQUIRE_EQUAL(job.id, id);

        action_killjobs({ id });
        BOOST_REQUIRE(is_jobs_table_empty());
    }
    FC_LOG_AND_RETHROW();
}

BOOST_FIXTURE_TEST_CASE(kill_all_jobs, killjobs_fixture) {
    try {
        std::vector<uint64_t> ids = { 0, 1, 2 };

        // Generate/check jobs
        for (auto id: ids) {
            action_requestrand();

            auto job = get_jobs_entry(id);
            BOOST_REQUIRE_EQUAL(job.id, id);
        }

        action_killjobs(ids);
        BOOST_REQUIRE(is_jobs_table_empty());
    }
    FC_LOG_AND_RETHROW();
}

BOOST_FIXTURE_TEST_CASE(kill_inexistent_job, killjobs_fixture) {
    try {
        action_requestrand();

        auto job = get_jobs_entry(0);
        BOOST_REQUIRE_EQUAL(job.id, 0);

        // Kill an inexistent job, nothing should happen
        action_killjobs({1000});

        job = get_jobs_entry(0);
        BOOST_REQUIRE_EQUAL(job.id, 0);
    }
    FC_LOG_AND_RETHROW();
}

BOOST_FIXTURE_TEST_CASE(kill_jobs_with_an_empty_table, killjobs_fixture) {
    try {
        action_killjobs({0, 1, 2});
    }
    FC_LOG_AND_RETHROW();
}

BOOST_AUTO_TEST_SUITE_END()
