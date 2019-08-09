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
#include "rsa_signer.hpp"

using namespace wax;
using contract_info::account_n;
using std::string;

BOOST_AUTO_TEST_SUITE(setrand_tests)

struct helper_tester : wax_fixture {
    const string public_key_exponent_1024 = "3";
    const string private_key_exponent_1024 = "00954e45c37dca926fcbde438a9f8df39643133e4877151a2d423da2a87c54a681cc3c27b6970e7289c67191f596ea5caed709d762b4c937d95da9279bb32292a344c57631a3adfa8d1a837699908861dfe108d9bd37184b3f8b3810e13f183382c497b424b4530b56bdfb6c97e0c74b9dec7558425221e2e4ba3a2737aa3e2f53";
    const string modulus_1024 = "dff568a53cafdba7b1cd654fef54ed61649cdd6cb29fa743e35c73fcba7ef9c2b25a3b91e295abcea9aa5af0625f8b06428ec3140f2dd3c60c7dbb698cb3dbf6c64b1160daec4eb7d6deca1dfc45b83d5f30e5398f6f737ee394d57c8d2bf412f056c2e8a54d9bf554149c0da31346e31f23ffb516b1f9797d650169199b7add";

    rsa_signer signer{ private_key_exponent_1024, modulus_1024 };
};

BOOST_FIXTURE_TEST_CASE(happy_path, helper_tester) {
    try {
        constexpr uint64_t job_id = 0;    // 1st job in the table
        constexpr uint64_t assoc_id = 10; // any value
        constexpr uint64_t signing_value = 1000;

        // Request a new random value
        action_requestrand(assoc_id, signing_value, receiver_n);

        // Simulte the Oracle random value generation
        action_setsigpubkey(public_key_exponent_1024, modulus_1024); 
        string signing_value_str {reinterpret_cast<const char*>(&signing_value), sizeof(signing_value) };
        string random_value = signer.sign(signing_value_str); 
        action_setrand(job_id, random_value);

        // Check if the callback "receiverand" was called
        auto result = get_results_entry();
        BOOST_REQUIRE_EQUAL(result.assoc_id, assoc_id);
        BOOST_REQUIRE_EQUAL(result.random_value, fc::sha256::hash(random_value));
    }
    FC_LOG_AND_RETHROW();
}

BOOST_AUTO_TEST_SUITE_END()
