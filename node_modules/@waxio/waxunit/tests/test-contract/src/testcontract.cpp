#include <testcontract.hpp>
#include <eosio/system.hpp>

ACTION testcontract::addentry(
  uint64_t id
) {
  entries_t _entries(get_self(), get_self().value);
  _entries.emplace(get_self(), [&](auto& row) {
    row.id = id;
    row.entry_time = time_point_sec(current_time_point().sec_since_epoch());
  });
}

ACTION testcontract::expireentry(
  uint64_t id,
  uint64_t expiry_seconds
) {
  entries_t _entries(get_self(), get_self().value);

  auto entry = _entries.require_find(id, "Entry could not be found");
  check(entry->entry_time + expiry_seconds <= time_point_sec(current_time_point().sec_since_epoch()), "Entry not expired yet");
  _entries.erase(entry);
}