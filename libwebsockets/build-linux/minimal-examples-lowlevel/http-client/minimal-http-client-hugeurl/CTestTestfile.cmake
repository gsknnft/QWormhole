# CMake generated Testfile for 
# Source directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl
# Build directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test(http-client-hugeurl-warmcat "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/bin/lws-minimal-http-client-hugeurl")
set_tests_properties(http-client-hugeurl-warmcat PROPERTIES  TIMEOUT "20" WORKING_DIRECTORY "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl" _BACKTRACE_TRIPLES "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl/CMakeLists.txt;27;add_test;/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl/CMakeLists.txt;0;")
add_test(http-client-hugeurl-warmcat-h1 "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/bin/lws-minimal-http-client-hugeurl" "--h1")
set_tests_properties(http-client-hugeurl-warmcat-h1 PROPERTIES  TIMEOUT "20" WORKING_DIRECTORY "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl" _BACKTRACE_TRIPLES "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl/CMakeLists.txt;28;add_test;/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/http-client/minimal-http-client-hugeurl/CMakeLists.txt;0;")
