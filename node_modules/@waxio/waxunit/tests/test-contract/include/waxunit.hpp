#pragma once
#include <eosio/eosio.hpp>
#include <eosio/print.hpp>

template <eosio::name::raw TableName, typename RowType, typename MultiIndexType>
void wax_insert_row(const eosio::name &_self, const eosio::name &table_name,
                      const eosio::name &scope,
                      const std::vector<char> &row_data) {
  MultiIndexType table(_self, scope.value);
  const RowType unpacked = eosio::unpack<RowType>(row_data);
  table.emplace(_self, [&](auto &obj) { obj = unpacked; });
}

#define WAX_STR(x) #x
#define WAX_TONAME(aname)                                                      \
  eosio::name { WAX_STR(aname) }

#define WAX_POPULATE_TABLE(r, dummy, field)                                    \
  case WAX_TONAME(BOOST_PP_SEQ_ELEM(0, field)).value: {                        \
    wax_insert_row<WAX_TONAME(BOOST_PP_SEQ_ELEM(0, field)),                    \
                     BOOST_PP_SEQ_ELEM(1, field),                              \
                     BOOST_PP_SEQ_ELEM(2, field)>(get_self(), row.table_name,  \
                                                  row.scope, row.row_data);    \
    break;                                                                     \
  }

struct waxload_payload {
  eosio::name table_name;
  eosio::name scope;
  std::vector<char> row_data;
};
// define this for production use
#ifdef WAX_SKIP_HELPERS
#define WAX_LOAD_TABLE_ACTION(TABLES)
#else
#define WAX_LOAD_TABLE_ACTION(TABLES)                                          \
  ACTION waxload(const std::vector<waxload_payload> payload) {                 \
    require_auth(eosio::name("eosio"));                                        \
    for (auto row : payload) {                                                 \
      switch (row.table_name.value) {                                          \
        BOOST_PP_SEQ_FOR_EACH(WAX_POPULATE_TABLE, DUMMY_MACRO, TABLES)         \
      default:                                                                 \
        eosio::check(false, "Unknown table to load fixture");                  \
      }                                                                        \
    }                                                                          \
  }
#endif