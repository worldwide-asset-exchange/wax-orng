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

using perm_vec_t = std::vector<permission_level>;
using contract_info::account_n;

BOOST_AUTO_TEST_SUITE(pause_tests)

struct pause_fixture: public wax_fixture {

    void action_pause(bool paused,
                      const account_name& actor) {
        push_action(account_n, N(pause), actor, mvo() ("paused", paused));
    }

    /// @todo Change permission_level to "perm_vec_t" in the future
    void action_pause(bool paused,
                      const permission_level& auths = { account_n, N(pause) }) {
        push_action(
            account_n,
            N(pause),
            perm_vec_t{auths},
            mvo() ("paused", paused));
    }

    bool contract_is_paused() {
        return get_config_value(N(paused)) != 0;
    }

}; // struct pause_fixture


BOOST_FIXTURE_TEST_CASE(check_contract_pause_api, pause_fixture) {
    try {
        action_pause(true);
        BOOST_REQUIRE(contract_is_paused());

        action_pause(false);
        BOOST_REQUIRE(!contract_is_paused());
    }
    FC_LOG_AND_RETHROW();
}

BOOST_FIXTURE_TEST_CASE(pause_a_contract_from_other_user_than_contract_user, pause_fixture) {
    try {
        create_accounts({N(other)});

        // Another account trying to pause the contract
        BOOST_REQUIRE_THROW(action_pause(true, N(other)), missing_auth_exception);
        BOOST_REQUIRE_THROW(action_pause(false, N(other)), missing_auth_exception);

        // Another account saying that it has permission to pause the contract
        BOOST_REQUIRE_THROW(action_pause(true, {N(other), N(pause)}), transaction_exception);
        BOOST_REQUIRE_THROW(action_pause(false, {N(other), N(pause)}), transaction_exception);
    }
    FC_LOG_AND_RETHROW();
}

BOOST_FIXTURE_TEST_CASE(check_paused_actions, pause_fixture) {
    try {
        action_pause(true);

        BOOST_REQUIRE_THROW(
            action_requestrand(1, 0, somecaller_n),
            eosio_assert_message_exception);

        BOOST_REQUIRE_THROW(
            action_setrand(1, "random value"),
            eosio_assert_message_exception);
    }
    FC_LOG_AND_RETHROW();
}

BOOST_AUTO_TEST_SUITE_END()
