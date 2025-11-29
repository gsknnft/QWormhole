set(libsocket_INCLUDE_DIRS "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers")

set(libsocket_BINARY_DIR "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/build")

include(${libsocket_BINARY_DIR}/libsocketTargets.cmake)

set(libsocket_LIBRARIES socket++)
