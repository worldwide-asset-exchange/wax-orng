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
using std::string;

BOOST_AUTO_TEST_SUITE(setsigpubkey_tests)

BOOST_FIXTURE_TEST_CASE(perms_test, wax_fixture) {
    try {
        const string public_key_exponent = "3";
        const string public_key_modulus = "dff568a53cafdba7b1cd654fef54ed61649cdd6cb29fa743e35c73fcba7ef9c2b25a3b91e295abcea9aa5af0625f8b06428ec3140f2dd3c60c7dbb698cb3dbf6c64b1160daec4eb7d6deca1dfc45b83d5f30e5398f6f737ee394d57c8d2bf412f056c2e8a54d9bf554149c0da31346e31f23ffb516b1f9797d650169199b7add";
        
        create_accounts({N(other)}, false);

        BOOST_REQUIRE_THROW(
            push_action(account_n, 
                        N(setsigpubkey), 
                        N(other), 
                        mvo()("exponent", public_key_exponent)
                             ("modulus", public_key_modulus)),
            authorization_exception);
    }
    FC_LOG_AND_RETHROW();

}

BOOST_FIXTURE_TEST_CASE(happy_path_test, wax_fixture) {
    const string public_key_exponent = "3";
    const string public_key_modulus = "dff568a53cafdba7b1cd654fef54ed61649cdd6cb29fa743e35c73fcba7ef9c2b25a3b91e295abcea9aa5af0625f8b06428ec3140f2dd3c60c7dbb698cb3dbf6c64b1160daec4eb7d6deca1dfc45b83d5f30e5398f6f737ee394d57c8d2bf412f056c2e8a54d9bf554149c0da31346e31f23ffb516b1f9797d650169199b7add";
    
    action_setsigpubkey(public_key_exponent, public_key_modulus);

    auto sigpubkey = get_sigpubkey_entry(0);

    BOOST_REQUIRE_EQUAL(sigpubkey.exponent, public_key_exponent);
    BOOST_REQUIRE_EQUAL(sigpubkey.modulus, public_key_modulus);
}

BOOST_FIXTURE_TEST_CASE(no_modulus_leading_zeroes, wax_fixture) {
    const string public_key_exponent = "3";
    const string public_key_modulus = "0dff568a53cafdba7b1cd654fef54ed61649cdd6cb29fa743e35c73fcba7ef9c2b25a3b91e295abcea9aa5af0625f8b06428ec3140f2dd3c60c7dbb698cb3dbf6c64b1160daec4eb7d6deca1dfc45b83d5f30e5398f6f737ee394d57c8d2bf412f056c2e8a54d9bf554149c0da31346e31f23ffb516b1f9797d650169199b7add";
    
    BOOST_REQUIRE_THROW(action_setsigpubkey(public_key_exponent, public_key_modulus), eosio_assert_message_exception);
}

BOOST_FIXTURE_TEST_CASE(no_empty_modulus, wax_fixture) {
    const string public_key_exponent = "3";
    const string public_key_modulus = "";
    
    BOOST_REQUIRE_THROW(action_setsigpubkey(public_key_exponent, public_key_modulus), eosio_assert_message_exception);
}

BOOST_FIXTURE_TEST_CASE(replacing_existing_key_test, wax_fixture) {
    const string public_key1_exponent = "3";
    const string public_key1_modulus = "dff568a53cafdba7b1cd654fef54ed61649cdd6cb29fa743e35c73fcba7ef9c2b25a3b91e295abcea9aa5af0625f8b06428ec3140f2dd3c60c7dbb698cb3dbf6c64b1160daec4eb7d6deca1dfc45b83d5f30e5398f6f737ee394d57c8d2bf412f056c2e8a54d9bf554149c0da31346e31f23ffb516b1f9797d650169199b7add";

    const string public_key2_exponent = "3";
    const string public_key2_modulus = "9678d65d9ce68184cd651c3559dbb5a8ed2ecccf6d33df63da4bd30433a3f5650f0841b847b63e42cb7864b2553adfe4692f5a87e17e101b15e724b41cb37be24b526c24e91efa3a244ec416d7666158c33b73a82c88beda0203c9ea142d9058452348c3d54f3fc8c34ba88904e445003631de7add3e9eed8a3f1eab943a21b21241f95592f4730363cfa2bd4c934420a843b95466634b2a68098fb468902d9d779f7aae477e6154bb6a80bd927d5b411014932c43673d00f7ff6e7f080da691e60e68294b99e57d6823610dce47556a0430a6753f2538b62b9790c94f71317d557488f53e534cfc7fe1fb7fc23526ec4b72310014247843ce6c9ed2b741c94f";
    
    action_setsigpubkey(public_key1_exponent, public_key1_modulus);

    auto sigpubkey = get_sigpubkey_entry(0);

    BOOST_REQUIRE_EQUAL(sigpubkey.exponent, public_key1_exponent);
    BOOST_REQUIRE_EQUAL(sigpubkey.modulus, public_key1_modulus);

    action_setsigpubkey(public_key2_exponent, public_key2_modulus);

    sigpubkey = get_sigpubkey_entry(0);

    BOOST_REQUIRE_EQUAL(sigpubkey.exponent, public_key2_exponent);
    BOOST_REQUIRE_EQUAL(sigpubkey.modulus, public_key2_modulus);
}

BOOST_AUTO_TEST_SUITE_END()
