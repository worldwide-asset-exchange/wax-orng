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
#print(" DONE.\n", end = '', flush = True)