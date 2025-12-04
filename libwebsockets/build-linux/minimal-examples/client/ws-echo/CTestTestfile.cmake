# CMake generated Testfile for 
# Source directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples/client/ws-echo
# Build directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/minimal-examples/client/ws-echo
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test(mssws_echo-warmcat "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/bin/lws-minimal-ss-ws-echo")
set_tests_properties(mssws_echo-warmcat PROPERTIES  TIMEOUT "40" WORKING_DIRECTORY "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples/client/ws-echo" _BACKTRACE_TRIPLES "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples/client/ws-echo/CMakeLists.txt;91;add_test;/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples/client/ws-echo/CMakeLists.txt;0;")
