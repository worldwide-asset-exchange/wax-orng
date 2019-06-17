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

#pragma once

#include <cstddef>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>

#include <boost/multiprecision/cpp_int.hpp>
#include <fc/crypto/sha256.hpp>

namespace wax {
    //// Simple RSA signer class
    class rsa_signer {
    public:
        /// @param private_exp Non empty hex string
        /// @param modulus Non empty hex string, the 1st char cannot be 0 (zero)
        /// @exception std::invalid_argument if strings are empty, non hex or
        ///            1st char in modulus is 0
        rsa_signer(const std::string& private_exp, const std::string& modulus) 
            : private_exp_{ "0x" + check_emptiness(private_exp) }
            , modulus_{ "0x" + check_modulus(check_emptiness(modulus)) }
            , modulus_size_{ modulus.size() } {
        }

        /// @param message Message/Data to sign
        /// @return Signed message as hex string
        /// @exception std::invalid_argument if message is empty
        std::string sign(const std::string& message) const {
            using namespace boost::multiprecision;

            check_emptiness(message);
            fc::sha256 message_hash(fc::sha256::hash(message.data(), message.size()));

            std::string pkcs1_encoding = 
                pkcs1_encode(modulus_size_, bytes_to_string(message_hash.data(), message_hash.data_size()));
            
            cpp_int pkcs1_encoding_big{ "0x" + pkcs1_encoding };
            cpp_int modexp = powm(pkcs1_encoding_big, private_exp_, modulus_);

            std::vector<char> result;
            export_bits(modexp, std::back_inserter(result), 8);

            return bytes_to_string(result.data(), result.size());
        }

        /// @todo Add getters/setter for private_exp and modulus

    // Implementation
    private:
        boost::multiprecision::cpp_int private_exp_;
        boost::multiprecision::cpp_int modulus_;
        std::size_t                    modulus_size_;

        static std::string bytes_to_string(const char* in, std::size_t size) {
            std::string out;
            const char* hex = "0123456789abcdef";
            for (std::size_t i = 0; i < size; i++) {
                out += hex[(in[i]>>4) & 0xF];
                out += hex[in[i] & 0xF];
            }
            return out;
        }

        static const std::string& check_emptiness(const std::string& str) {
            if (str.empty()) throw std::invalid_argument("String cannot be empty");
            return str;
        }

        static const std::string& check_modulus(const std::string& modulus) {
            if (modulus[0] == '0') throw std::invalid_argument("No leading zeroes allowed in modulus");
            return modulus;
        }

        /**
         * @dev Generates the pkcs1 encoding for an already hashed (via sha256) message.
         * @param modulus_length [size_t] the length in hex digits of the modulus, not including any leading zeroes
         * @param message_hash [string] the sha256 hash of the message intended for signing over
         * @returns [string] the pkcs1 encoding for the message hash given the modulus length
         *
         * For more on RSA signatures, see:
         * https://www.emc.com/collateral/white-papers/h11300-pkcs-1v2-2-rsa-cryptography-standard-wp.pdf
         * Page 39 is extra useful for understanding the padding scheme
         */
        static std::string pkcs1_encode(std::size_t modulus_length, const std::string& message_hash) {
            // pkcs1 padding constant indicating sha256 was used as the message digest for signing
            const char* PKCS1_SHA256 = "003031300d060960864801650304020105000420";

            // Prepend the hash type identifier for sha256
            std::string pkcs1_encoding = PKCS1_SHA256 + message_hash;

            // Prepend all f's and a starting 1 so that the final result is as long as the modulus, minus 3
            pkcs1_encoding = std::string(modulus_length - pkcs1_encoding.size() - 3, 'f').append(pkcs1_encoding);

            // First byte must be 1
            pkcs1_encoding[0] = '1';
            return pkcs1_encoding;
        }

    }; // class rsa_signer


} // namespace wax

