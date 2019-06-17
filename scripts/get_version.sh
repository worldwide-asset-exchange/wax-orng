#!/usr/bin/env bash

VERSION=$(grep -E "project(.*)VERSION" ./CMakeLists.txt | awk -F '[ )]' '{print $3}')

echo "${VERSION}"
