# CMake generated Testfile for 
# Source directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-hugeurl
# Build directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-hugeurl
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test(ss-warmcat-hurl "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/bin/lws-minimal-secure-streams-hugeurl" "-h" "1024" "--h1")
set_tests_properties(ss-warmcat-hurl PROPERTIES  TIMEOUT "20" WORKING_DIRECTORY "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-hugeurl" _BACKTRACE_TRIPLES "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-hugeurl/CMakeLists.txt;51;add_test;/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-hugeurl/CMakeLists.txt;0;")
