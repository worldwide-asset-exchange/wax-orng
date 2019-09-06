#!/usr/bin/env python3

#
# MIT License
# 
# Copyright (c) 2019 worldwide-asset-exchange, script author: emessina
# 
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

#####################################################################################
# This tool checks for subtle error when writing smart contracts or unit tests.
# Covers errors like forgetting fields when serializing tables.
# Parsing code that does not follow the coding style results in undefined behavior.
#####################################################################################

import sys, struct, os
from os import listdir
from os.path import isfile, join

WAX_PARSER_VERSION = "1.1.0"
#print("WAX Parser version: " + WAX_PARSER_VERSION)
#print("Running table serialization analysis...", end = '')

quiet = False
if len(sys.argv) == 2:
    if sys.argv[1] == "--version":
        print(WAX_PARSER_VERSION)
        sys.exit()
    quiet = sys.argv[1] == "--quiet"

utest_path = "tests/src/"
files = [f for f in listdir(utest_path) if isfile(join(utest_path, f))]
for file_name in files:
    file_path = utest_path + file_name
    if not quiet: print("file_path: " + file_path)

    if not os.access(file_path, os.R_OK):
        if not quiet: print("File does not exist.")
        sys.exit(1)

    file = open(file_path, "r")
    all_words = map(lambda l: l.split(" "), file.readlines())

    reading_table_header = False
    reading_table_foot = False
    last_state = ""
    iterating_table = False
    prev_word = ""
    table_name = ""
    fields = []
    serialized_fields = []
    prev_table_fields = []

    for line in all_words:
        for word in line:
            if reading_table_header:
                table_name = word
                reading_table_header = False
                iterating_table = True
                last_state = "reading_table_header"
                break

            if reading_table_foot:
                # Removes last two characters and EOL from the last element in 'line'.
                items = line[-1][0:len(line[-1]) - 3]
                if not quiet:
                    if last_state == "reading_table_foot":
                        print(table_name + ": " + str(len(prev_table_fields)))
                        print(prev_table_fields)
                    else:
                        print(table_name + ": " + str(len(fields)))
                        print(fields)
                for x in range(0, len(fields)):
                    opening_pos = items.find('(')
                    closing_pos = items.find(')')
                    item = items[opening_pos + 1:closing_pos]
                    if item == '':
                        continue
                    serialized_fields.append(item)
                    items = items[closing_pos + 1:len(items)]

                # Evalues serialized field on multiple footers.
                if last_state == "reading_table_foot":
                    for x in range(0, len(prev_table_fields)):
                        opening_pos = items.find('(')
                        closing_pos = items.find(')')
                        item = items[opening_pos + 1:closing_pos]
                        if item == '':
                            continue
                        serialized_fields.append(item)
                        items = items[closing_pos + 1:len(items)]

                if len(prev_table_fields) != len(serialized_fields) and last_state == "reading_table_foot":
                    print(file_name + ": The fields number in table " + table_name + " and its serialized fields do not match.")
                    sys.exit(1)

                if len(fields) != len(serialized_fields) and last_state != "reading_table_foot":
                    print(file_name + ": The fields number in table " + table_name + " and its serialized fields do not match.")
                    sys.exit(1)
                
                for i in range(0, len(fields)):
                    if fields[i] != serialized_fields[i]:
                        print("'" + fields[i] + "' field was not serialized. Review table " + table_name + ".")
                        sys.exit(1)

                if not quiet: print("Serialized_fields: " + str(len(serialized_fields)))
                if not quiet: print(serialized_fields)
                if not quiet: print("\n")
                prev_table_fields = fields.copy()
                fields.clear()
                serialized_fields.clear()
                reading_table_foot = False
                last_state = "reading_table_foot"

            if "FC_REFLECT" in word:
                iterating_table = False
                reading_table_foot = True

            if iterating_table:
                # Removes last character and EOL from the last element in 'line'.
                item = line[-1][0:len(line[-1]) - 2]
                if item == "}":
                    last_state = "iterating_table"
                    break

                fields.append(item)
                break

            if word == "__attribute((packed))" and prev_word == "struct":
                reading_table_header = True

            prev_word = word

#print(" DONE.\n", end = '', flush = True)