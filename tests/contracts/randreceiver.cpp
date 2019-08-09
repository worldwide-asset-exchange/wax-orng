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

#include <eosio/eosio.hpp>
#include <eosio/print.hpp>

#include <stdint.h>
#include <string>

using namespace eosio;

CONTRACT randreceiver: public contract {
public:
    randreceiver(name receiver, name code, datastream<const char*> ds)
        : contract(receiver, code, ds)
        , results_table(receiver, receiver.value) {
    }

    ACTION receiverand(uint64_t assoc_id, const eosio::checksum256& random_value) {
        auto rv_byte_array = random_value.extract_as_byte_array();
        auto rv_string = bytes_to_string(rv_byte_array.data(), rv_byte_array.size());

        print_f("receiverand called: assoc_id=%, random_value=%\n", assoc_id, rv_string );

        set_last_result(assoc_id, random_value);
    }

    ACTION resetresult() {
        set_last_result(0, eosio::checksum256());
    }

private:
    TABLE results {
        uint64_t    id;
        uint64_t    assoc_id;
        eosio::checksum256 random_value;

        auto primary_key() const { return id; }
    };
    
    multi_index<"results"_n, results> results_table;

    void set_last_result(uint64_t assoc_id, const eosio::checksum256& random_value) {
        auto it = results_table.find(0);

        if (it == results_table.end()) {
            results_table.emplace(get_self(), [&](auto& rec) {
                rec.id = 0;
                rec.assoc_id = assoc_id;
                rec.random_value = random_value;
            });
        }
        else {
            results_table.modify(it, get_self(), [&](auto& rec) {
                rec.assoc_id = assoc_id;
                rec.random_value = random_value;
            });
        }
    }


    static std::string bytes_to_string(const unsigned char* in, std::size_t size) {
        std::string out;
        const char* hex = "0123456789abcdef";
        for (std::size_t i = 0; i < size; i++) {
            out += hex[(in[i]>>4) & 0xF];
            out += hex[in[i] & 0xF];
        }
        return out;
    }
   
};

EOSIO_DISPATCH(randreceiver, (receiverand)(resetresult))
