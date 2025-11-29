# Install script for directory: /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "/usr")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Install shared libraries without execute permission?
if(NOT DEFINED CMAKE_INSTALL_SO_NO_EXE)
  set(CMAKE_INSTALL_SO_NO_EXE "1")
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

# Set default install directory permissions.
if(NOT DEFINED CMAKE_OBJDUMP)
  set(CMAKE_OBJDUMP "/usr/bin/objdump")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/libsocket" TYPE FILE FILES
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./unixdgram.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./exception.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./inetclientdgram.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./libinetsocket.h"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./unixserverstream.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./dgramclient.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./streamclient.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./inetserverstream.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./unixclientdgram.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./socket.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./inetbase.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./inetserverdgram.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./unixclientstream.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./libunixsocket.h"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./select.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./inetclientstream.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./unixbase.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./unixserverdgram.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./inetdgram.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./dgramoverstream.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./framing.hpp"
    "/mnt/c/Users/G/Desktop/Builds/sigilnet/packages/qwormhole/libsocket/headers/./epoll.hpp"
    )
endif()

