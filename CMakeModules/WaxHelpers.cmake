# MIT License
# 
# Copyright (c) 2019 worldwide-asset-exchange
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

# Please update this variable everytime this file is modified
set(WAX_HELPERS_VERSION "1.2.0")

include(ExternalProject)
find_package(Git REQUIRED)
include(GNUInstallDirs)

set(WAX_TABLE_SERIALIZATION_PARSER "table_serialization_parser.py")

################################################################################
# Add a new contract to the specified target 
# This function has portions based on 
# 'add_wasm_executable' ($EOS_HOME/CMakeModules/wasm.cmake)
#
# 4 additional targets are going to be created:
#   <contract name>_abi
#   <contract name>_abi_hpp
#   <contract name>_wast
#   <contract name>_wast_hpp
#
# Where <contrat name> is the name of the contract source file where EOSIO_ABI
# macro is used, but without extension. See CONTRACT_SOURCE_FILE parameter below.
#
# Parameter: PARENT_TARGET It must exist before calling this function.
# Parameter: CONTRACT_SOURCE_FILE(s) At least one EOS contract cpp file (the 
#            1st one must define the contract, in other words, it must have a 
#            reference to EOSIO_ABI macro).
function(wax_add_contract PARENT_TARGET CONTRACT_SOURCE_FILE)
    message (AUTHOR_WARNING "This function is deprecated, consider using eosio.cdt add_contract instead")
    
    set(EOS_COMPILER /usr/local/eosio/bin/eosiocpp)

    # Validate the contract source file (this file is used to generate the ABI file)
    file(READ ${CONTRACT_SOURCE_FILE} CONTRACT_SOURCE_FILE_CONTENT) 
   
    string(FIND "${CONTRACT_SOURCE_FILE_CONTENT}" "EOSIO_ABI" POSITION)
    if ("${POSITION}" STREQUAL "-1")
        message(FATAL_ERROR "The 1st file passed to 'add_contract' must use EOSIO_ABI macro")
    endif()

    # The "contract name" used to create make rules is the name of the file where EOSIO_ABI
    # is used but without extension    
    get_filename_component(CONTRACT_NAME ${CONTRACT_SOURCE_FILE} NAME_WE)
    
    # Build file list with contract source file and the extra/optional source files (${ARGN}),
    # all of them with full path, necessary for contract compiler (for cmake is superflous)
    set(ALL_SOURCE_FILES ${PROJECT_SOURCE_DIR}/${CONTRACT_SOURCE_FILE})
    
    foreach(SOURCE_FILE ${ARGN})
        list(APPEND ALL_SOURCE_FILES ${PROJECT_SOURCE_DIR}/${SOURCE_FILE})
    endforeach()
    
    # Base file name for all output files
    set(BASE_OUTPUT_FILE ${PROJECT_BINARY_DIR}/${CONTRACT_NAME})


    ########################################
    # .wast/.abi file generation

    # Prepare compiler definitions
    set (COMPILER_FLAGS "")
    foreach(DEF ${${PARENT_TARGET}_CONTRACT_DEFINITIONS})
        set (COMPILER_FLAGS "${COMPILER_FLAGS}-D${DEF} ")
    endforeach()

    message(STATUS "Contract compiler definitions = ${COMPILER_FLAGS}")

    # Any modification in the specified contract file will generate a .wast file
    add_custom_command(
        OUTPUT ${BASE_OUTPUT_FILE}.wast
        DEPENDS ${ALL_SOURCE_FILES}
        COMMAND env "EOSIOCPP_CFLAGS='${COMPILER_FLAGS}'" ${EOS_COMPILER} -o ${BASE_OUTPUT_FILE}.wast ${ALL_SOURCE_FILES})

    # This target will be only rebuilt if .wast file is generated
    add_custom_target(
        ${CONTRACT_NAME}_wast ALL
        DEPENDS ${BASE_OUTPUT_FILE}.wast
        SOURCES ${ALL_SOURCE_FILES})

    # Any modification in the specified contract file will generate a .abi file
    # TODO Investigate how EOSIOCPP_CFLAGS must be passed. Right now, it is not
    #      possible to do the same like .wast generation (it fails)
    add_custom_command(
        OUTPUT ${BASE_OUTPUT_FILE}.abi
        DEPENDS ${CONTRACT_SOURCE_FILE}
        #COMMAND  env EOSIOCPP_CFLAGS="${COMPILER_FLAGS}" ${EOS_COMPILER} -g ${BASE_OUTPUT_FILE}.abi ${PROJECT_SOURCE_DIR}/${CONTRACT_SOURCE_FILE})
        COMMAND  ${EOS_COMPILER} -g ${BASE_OUTPUT_FILE}.abi ${PROJECT_SOURCE_DIR}/${CONTRACT_SOURCE_FILE})

    # This target will be only rebuilt if .abi file is generated
    add_custom_target(
        ${CONTRACT_NAME}_abi ALL
        DEPENDS ${BASE_OUTPUT_FILE}.abi
        SOURCES ${CONTRACT_SOURCE_FILE})

    ########################################
    # .wast.hpp/.abi.hpp file generation

    set(WASP_HEADER ${BASE_OUTPUT_FILE}.wast.hpp)
    set(ABI_HEADER ${BASE_OUTPUT_FILE}.abi.hpp)

    # A wast header will be generated if a .wast file was generated
    add_custom_command(
        OUTPUT ${WASP_HEADER}
        DEPENDS ${BASE_OUTPUT_FILE}.wast
        COMMAND echo "const char* const ${CONTRACT_NAME}_wast = R\"=====(" > ${WASP_HEADER}
        COMMAND cat ${BASE_OUTPUT_FILE}.wast >> ${WASP_HEADER}
        COMMAND echo ")=====\";" >> ${WASP_HEADER}
        COMMENT "Generating ${CONTRACT_NAME}.wast.hpp"
        VERBATIM)
    
    # This target will be only rebuilt if a wast header was generated
    add_custom_target(
        ${CONTRACT_NAME}_wast_hpp ALL
        DEPENDS ${WASP_HEADER}
        SOURCES ${WASP_HEADER})

    # Based on portions of add_wasm_executable ($EOS_HOME/CMakeModules/wasm.cmake)
    add_custom_command(
        OUTPUT ${ABI_HEADER}
        DEPENDS ${BASE_OUTPUT_FILE}.abi
        COMMAND echo "const char* const ${CONTRACT_NAME}_abi = R\"=====(" > ${ABI_HEADER}
        COMMAND cat ${BASE_OUTPUT_FILE}.abi >> ${ABI_HEADER}
        COMMAND echo ")=====\";" >> ${ABI_HEADER}
        COMMENT "Generating ${CONTRACT_NAME}.abi.hpp"
        VERBATIM)
        
    add_custom_target(
        ${CONTRACT_NAME}_abi_hpp ALL
        DEPENDS ${ABI_HEADER}
        SOURCES ${ABI_HEADER})

    ########################################
    # Clean up and final dependency rules

    set_property(DIRECTORY APPEND PROPERTY ADDITIONAL_MAKE_CLEAN_FILES
        ${BASE_OUTPUT_FILE}.wast
        ${BASE_OUTPUT_FILE}.abi
        ${BASE_OUTPUT_FILE}.wasm
        ${ABI_HEADER}
        ${WASP_HEADER})

    add_dependencies(${PARENT_TARGET} 
        ${CONTRACT_NAME}_abi 
        ${CONTRACT_NAME}_wast
        ${CONTRACT_NAME}_abi_hpp 
        ${CONTRACT_NAME}_wast_hpp)

    # Allow unit test code to use the generated header files
    include_directories(${PROJECT_BINARY_DIR})

endfunction()


################################################################################
# Add a linting process to the specified target 
# 
# Parameter: PARENT_TARGET It must exist before calling this function.
# Parameter: FILES A file mask or one or more files to be linted.
# TODO Figure out how to use PRE_LINK hook step instead POST_BUILD
# TODO Update cppcheck command line when the tool supports C++17
# TODO Righ now Ubuntu 18.04 has cppcheck 1.82 which has bug that ignores inline
#      suppressions (useful to ignore unsupported C++17 code) specified by, for 
#      example: // cppcheck-suppress syntaxError 
#      For more details see: https://sourceforge.net/p/cppcheck/discussion/general/thread/d4463c60/
#      Inline suppressions can be used when cppcheck will be upated to 1.86
function(wax_add_linting PARENT_TARGET FILES)
    # Was linting (temporary) disabled?
    if ("${WAX_LINTING_DISABLED}" STREQUAL "1" OR "$ENV{WAX_LINTING_DISABLED}" STREQUAL "1")
        return()
    endif()
    
    # Add extra files passed as optional arguments
    if (${ARGC} GREATER 2)
        set (FILES ${FILES} ${ARGN})
    endif()
   
    #message("Files to lint = ${FILES}")

    # Linting 
    # TODO CMake 3.10 adds support for cppcheck. Remove the following lines
    #         when update to that version. For more details see: 
    #         https://stackoverflow.com/questions/48625499/cppcheck-support-in-cmake
    # TODO Check cppcheck parameters in order to improve the checking process
    add_custom_command(
        TARGET ${PARENT_TARGET} POST_BUILD # PRE_LINK cannot be used because "test" task (wax_add_test_subproject) doesn't have a link step
        COMMAND ${WAX_CPPCHECK_EXECUTABLE} ARGS -q --error-exitcode=1 --inline-suppr ${FILES}
        WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
        COMMENT "cppcheck(ing) source code...")   
    
    set (CPPLINT_FILTERS " \
         -build,-legal,-readability,-runtime,-whitespace, \
         +build/c++14, \
         +whitespace/braces, \
         +whitespace/comma, \
         +whitespace/blankline, \
         +whitespace/parens, \
         +whitespace/linelength \
         ")
  
    add_custom_command(
        TARGET ${PARENT_TARGET} POST_BUILD # PRE_LINK cannot be used because "test" task (wax_add_test_subproject) doesn't have link step
        COMMAND ${WAX_CPPLINT_EXECUTABLE} 
        ARGS --quiet 
             --output=eclipse 
             --linelength=100
             --filter=${CPPLINT_FILTERS}
            ${FILES}
        WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
        COMMENT "cpplint(ing) source code...") 

    add_custom_command(
        TARGET ${PARENT_TARGET} POST_BUILD # PRE_LINK cannot be used because "test" task (wax_add_test_subproject) doesn't have link step
        COMMAND ${PROJECT_SOURCE_DIR}/scripts/${WAX_TABLE_SERIALIZATION_PARSER}
        ARGS --quiet
        WORKING_DIRECTORY ${PROJECT_SOURCE_DIR} 
        COMMENT "parsing table serialization source code...")
        
endfunction()


################################################################################
# This is an enhanced replacement for cmake 'add_subdirectory' function. The 
# latter cannot be used because contract and unit tests use different compilers
# and cmake can only manage 1 compiler at a time.
# 
# Parameter: CONTRACT_NAME the name of the contract
# Parameter: BASE_TARGET_NAME the prefix of the target that it will be created.
#            The result target is a combination of BASE_TARGET_NAME and the last
#            part of DIR_NAME.
# Parameter: DIR_NAME subdirectory where tests project resides
function(wax_add_test_subproject CONTRACT_NAME BASE_TARGET_NAME DIR_NAME)
    # Gets the last part of the directory path in order to create the target
    # (similar to add_subdirectory). Be aware that the last part cannot be
    # "test" because it is a reserved target name
    get_filename_component(TARGET_NAME ${DIR_NAME} NAME) 

    # Avoid cmake to treat paths as cmake lists
    string(REPLACE ";" "|" TEST_FRAMEWORK_PATH "${CMAKE_FRAMEWORK_PATH}")
    string(REPLACE ";" "|" TEST_MODULE_PATH "${CMAKE_MODULE_PATH}")

    # The unit test subproject uses another compiler, that's why we use
    # ExternalProject_Add instead of add_subdirectory
    ExternalProject_Add(
        ${BASE_TARGET_NAME}.${TARGET_NAME}
        LIST_SEPARATOR | # Use the alternate list separator
        CMAKE_ARGS 
            -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE} 
            -DCONTRACT_NAME=${CONTRACT_NAME}
            -DCONTRACT_DIR=${PROJECT_BINARY_DIR}
        SOURCE_DIR ${PROJECT_SOURCE_DIR}/${DIR_NAME}
        BINARY_DIR ${PROJECT_BINARY_DIR}/${TARGET_NAME}
        BUILD_ALWAYS 1
        TEST_COMMAND   ""
        INSTALL_COMMAND "")

endfunction()



################################################################################
#
# Check requirements
#


###############################
# Linters

# Was linting disabled by cmake command line or environment variable?
if ("${WAX_LINTING_DISABLED}" STREQUAL "1" OR
    "$ENV{WAX_LINTING_DISABLED}" STREQUAL "1")

    message (STATUS "Linting is disabled")

else()
    find_program(WAX_CPPCHECK_EXECUTABLE NAMES cppcheck)
    if (NOT WAX_CPPCHECK_EXECUTABLE)
        message (FATAL_ERROR "Cannot find 'cppcheck' in your system")
    else()
        message (STATUS "Using cppcheck from ${WAX_CPPCHECK_EXECUTABLE}")
    endif()

    find_program(WAX_CPPLINT_EXECUTABLE NAMES cpplint)
    if (NOT WAX_CPPLINT_EXECUTABLE)
        message (FATAL_ERROR "Cannot find 'cpplint' in your system")
    else()
        message (STATUS "Using cpplint from ${WAX_CPPLINT_EXECUTABLE}")
    endif()

    find_program(WAX_PARSER_EXECUTABLE NAMES "${PROJECT_SOURCE_DIR}/scripts/${WAX_TABLE_SERIALIZATION_PARSER}")
    if (NOT WAX_PARSER_EXECUTABLE)
        message (FATAL_ERROR "Cannot find 'table serialization parser' in your system")
    else()
        execute_process(COMMAND ${WAX_PARSER_EXECUTABLE} --version OUTPUT_VARIABLE WAX_PARSER_VERSION)
        string(STRIP "${WAX_PARSER_VERSION}" WAX_PARSER_VERSION)
        message (STATUS "Using table serialization parser version: ${WAX_PARSER_VERSION}" )
    endif()

endif()


###############################
# Validates EOSIO installation

# Was EOSIO_INSTALL_PREFIX set from command line or env.variable? (cmake -D EOSIO_INSTALL_PREFIX=<directory> ..)
if ("${EOSIO_INSTALL_PREFIX}" STREQUAL "")
    if ("$ENV{EOSIO_INSTALL_PREFIX}" STREQUAL "")
        # Default location
        set(EOSIO_INSTALL_PREFIX  "/usr/local/eosio")
    else ()
        set(EOSIO_INSTALL_PREFIX $ENV{EOSIO_INSTALL_PREFIX})
    endif ()
endif ()

if (NOT EXISTS ${EOSIO_INSTALL_PREFIX})
    message(FATAL_ERROR 
        "Cannot find EOSIO installation in '${EOSIO_INSTALL_PREFIX}'. " 
        "Did you installed EOSIO? if so, did you compiled with default prefix installation? If you didn't, "
        "try setting the cmake/environment variable EOSIO_INSTALL_PREFIX with the current location before running cmake again.")
endif()

file(READ "${EOSIO_INSTALL_PREFIX}/include/eosio/chain/core_symbol.hpp" WAX_CORE_SYMBOL_CONTENT)

# If WAX currency symbol is set I assume that other settings have already been set (see prepare_and_buid_eos.sh script)
string(FIND "${WAX_CORE_SYMBOL_CONTENT}" "CORE_SYMBOL SY(8,WAX)" WAX_POSITION)
if ("${WAX_POSITION}" STREQUAL "-1")
    message(FATAL_ERROR
        "EOSIO installation is not prepared for WAX. Please run the script "
        "'${PROJECT_SOURCE_DIR}/scripts/prepare_and_build_eos.sh' and try again later")
endif()

message(STATUS "WAX Helpers version = ${WAX_HELPERS_VERSION}")

