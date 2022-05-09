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
using contract_info::account_n;

BOOST_AUTO_TEST_SUITE(acceptbwpay_tests)

BOOST_FIXTURE_TEST_CASE(accept_bwpayer, wax_fixture) {
    try {
        action_setbwpayer(somepayee_n, somepayer1_n);
        produce_block();

        auto bwpayers = get_bwpayers_entry(somepayee_n);
        BOOST_REQUIRE_EQUAL(bwpayers.accepted, false);

        action_acceptbwpay(somepayee_n, somepayer1_n, true);
        produce_block();

        bwpayers = get_bwpayers_entry(somepayee_n);
        BOOST_REQUIRE_EQUAL(bwpayers.accepted, true);

        action_acceptbwpay(somepayee_n, somepayer1_n, false);
        produce_block();

        bwpayers = get_bwpayers_entry(somepayee_n);
        BOOST_REQUIRE_EQUAL(bwpayers.accepted, false);
    }
    FC_LOG_AND_RETHROW();
}

BOOST_FIXTURE_TEST_CASE(throw_if_payer_does_not_exist, wax_fixture) {
    try {
        BOOST_REQUIRE_THROW(
            action_acceptbwpay(N(fakepayer), somepayer1_n, true),
            eosio_assert_message_exception);
    }
    FC_LOG_AND_RETHROW();
}

BOOST_FIXTURE_TEST_CASE(throw_if_payer_invalid, wax_fixture) {
    try {
        action_setbwpayer(somepayee_n, somepayer1_n);
        produce_block();

        auto bwpayers = get_bwpayers_entry(somepayee_n);
        BOOST_REQUIRE_EQUAL(bwpayers.accepted, false);

        BOOST_REQUIRE_THROW(
            action_acceptbwpay(somepayee_n, somepayer2_n, true),
            eosio_assert_message_exception);
    }
    FC_LOG_AND_RETHROW();
}

BOOST_AUTO_TEST_SUITE_END()
