#include <eosio/eosio.hpp>
#include "waxunit.hpp"

using namespace std;
using namespace eosio;

CONTRACT testcontract : public contract {
  public:
    using contract::contract;

    ACTION addentry(
      uint64_t id
    );

    ACTION expireentry(
      uint64_t id,
      uint64_t expiry_seconds
    );

  private:
    TABLE entries {
      uint64_t id;
      time_point_sec entry_time;

      uint64_t primary_key() const { return id; }
    };
    typedef multi_index<
      "entries"_n,
      entries
    > entries_t;

  public:
    WAX_LOAD_TABLE_ACTION(
      ((entries)(entries)(entries_t))
    )
};
