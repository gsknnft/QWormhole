# CMake generated Testfile for 
# Source directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-stress
# Build directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-stress
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test(ssstress-warmcat "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/build-linux/bin/lws-minimal-secure-streams-stress" "-c" "2" "--budget" "3" "--timeout_ms" "50000")
set_tests_properties(ssstress-warmcat PROPERTIES  TIMEOUT "110" WORKING_DIRECTORY "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-stress" _BACKTRACE_TRIPLES "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-stress/CMakeLists.txt;51;add_test;/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets/minimal-examples-lowlevel/secure-streams/minimal-secure-streams-stress/CMakeLists.txt;0;")
