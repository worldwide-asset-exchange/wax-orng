#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>
#include <eosio/asset.hpp>

using namespace eosio;
using namespace std;

namespace delphioracle {

    static constexpr name DELPHIORACLE_ACCOUNT = name("delphioracle");

    typedef uint16_t asset_type;

    struct pairs_s {

        bool active;
        bool bounty_awarded;
        bool bounty_edited_by_custodians;

        name proposer;
        name name;

        asset bounty_amount;

        std::vector <eosio::name> approving_custodians;
        std::vector <eosio::name> approving_oracles;

        symbol base_symbol;
        asset_type base_type;
        eosio::name base_contract;

        symbol quote_symbol;
        asset_type quote_type;
        eosio::name quote_contract;

        uint64_t quoted_precision;

        uint64_t primary_key() const { return name.value; }

    };

    typedef multi_index<name("pairs"), pairs_s> pairs_t;


    //Scope: pair_name
    struct datapoints_s {
        uint64_t id;
        name owner;
        uint64_t value;
        uint64_t median;
        time_point timestamp;

        uint64_t primary_key() const { return id; }

        uint64_t by_timestamp() const { return timestamp.elapsed.to_seconds(); }

        uint64_t by_value() const { return value; }

    };

    typedef eosio::multi_index<"datapoints"_n, datapoints_s,
        indexed_by<"value"_n, const_mem_fun < datapoints_s, uint64_t, &datapoints_s::by_value>>,
    indexed_by<"timestamp"_n, const_mem_fun<datapoints_s, uint64_t, &datapoints_s::by_timestamp>>>
    datapoints_t;

    pairs_t pairs = pairs_t(DELPHIORACLE_ACCOUNT, DELPHIORACLE_ACCOUNT.value);

    datapoints_t get_datapoints(name pair_name) {
        return datapoints_t(DELPHIORACLE_ACCOUNT, pair_name.value);
    }

}