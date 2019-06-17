#!/usr/bin/env bash

echo $(grep -E "project(.*)VERSION" ./CMakeLists.txt | awk -F '[ (]' '{print $2}')
