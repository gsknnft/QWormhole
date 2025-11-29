{
  "targets": [
    {
      "target_name": "libsocket_internal",
      "conditions": [
        [
          "OS=='win'",
          {
            "type": "none",
            "sources": []
          },
          {
            "type": "static_library",
            "sources": [
              "libsocket/C/inet/libinetsocket.c",
              "libsocket/C/unix/libunixsocket.c",
              "libsocket/C++/dgramclient.cpp",
              "libsocket/C++/dgramoverstream.cpp",
              "libsocket/C++/exception.cpp",
              "libsocket/C++/framing.cpp",
              "libsocket/C++/inetbase.cpp",
              "libsocket/C++/inetclientdgram.cpp",
              "libsocket/C++/inetclientstream.cpp",
              "libsocket/C++/inetdgram.cpp",
              "libsocket/C++/inetserverdgram.cpp",
              "libsocket/C++/inetserverstream.cpp",
              "libsocket/C++/select.cpp",
              "libsocket/C++/socket.cpp",
              "libsocket/C++/streamclient.cpp",
              "libsocket/C++/unixbase.cpp",
              "libsocket/C++/unixclientdgram.cpp",
              "libsocket/C++/unixclientstream.cpp",
              "libsocket/C++/unixdgram.cpp",
              "libsocket/C++/unixserverdgram.cpp",
              "libsocket/C++/unixserverstream.cpp"
            ],
            "include_dirs": [
              "<(module_root_dir)/libsocket/headers",
              "<(module_root_dir)/libsocket",
              "<(module_root_dir)/libsocket/C",
              "<(module_root_dir)/libsocket/C++"
            ],
            "cflags_cc": ["-std=c++11", "-fPIC", "-fexceptions"],
            "cflags": ["-fPIC"]
          }
        ]
      ]
    },
    {
      "target_name": "qwormhole",
      "conditions": [
        [
          "OS=='win'",
          {
            "type": "none",
            "sources": []
          },
          {
            "sources": ["c/qwormhole.cpp"],
            "include_dirs": [
              "<!@(node -p \"require('node-addon-api').include\")",
              "<(module_root_dir)/libsocket/headers"
            ],
            "dependencies": [
              "<!(node -p \"require('node-addon-api').gyp\")",
              "libsocket_internal"
            ],
            "cflags_cc!": ["-fno-exceptions"],
            "cflags!": ["-fno-exceptions"],
            "defines": ["NAPI_CPP_EXCEPTIONS"],
            "cflags_cc": ["-std=c++17"],
            "libraries": [
              "<(PRODUCT_DIR)/socket_internal.a"
            ]
          }
        ]
      ]
    }
    ,
    {
      "target_name": "qwormhole_lws",
      "sources": ["c/qwormhole_lws.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(module_root_dir)/libwebsockets/include",
        "<(module_root_dir)/libwebsockets/build"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags!": ["-fno-exceptions"],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "cflags_cc": ["-std=c++17"],
      "conditions": [
        [
          "OS=='win'",
          {
            "libraries": [
              "<(module_root_dir)/libwebsockets/build/lib/Release/websockets_static.lib",
              "libssl.lib",
              "libcrypto.lib",
              "ws2_32.lib",
              "userenv.lib",
              "crypt32.lib",
              "shlwapi.lib",
              "advapi32.lib",
              "ole32.lib",
              "secur32.lib",
              "iphlpapi.lib",
              "gdi32.lib",
              "msvcrt.lib",
              "ucrt.lib",
              "vcruntime.lib"
            ],
            "msvs_settings": {
              "VCLinkerTool": {
                "AdditionalLibraryDirectories": [
                  "<!(node -p \"process.env.OPENSSL_LIB_DIR || 'C:/Program Files/OpenSSL-Win64/lib/VC/x64/MD' \")"
                ]
              }
            }
          },
          {
            "libraries": [
              "<(module_root_dir)/libwebsockets/build/lib/libwebsockets.a",
              "-lz",
              "-lssl",
              "-lcrypto",
              "-lpthread"
            ]
          }
        ]
      ]
    }
  ]
}
