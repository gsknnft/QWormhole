#include <napi.h>
#include <libwebsockets.h>

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

class LwsClientWrapper : public Napi::ObjectWrap<LwsClientWrapper> {
 public:
 static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit LwsClientWrapper(const Napi::CallbackInfo& info);
  ~LwsClientWrapper() override;

  // lws plumbing (must be public for the protocol table)
  static int Callback(struct lws* wsi, enum lws_callback_reasons reason,
                      void* user, void* in, size_t len);

 private:
  struct Options {
    std::string host;
    uint16_t port = 0;
    bool use_tls = false;
    bool reject_unauthorized = true;
    std::string server_name;
    std::string alpn_list;
    std::vector<uint8_t> tls_ca;
    std::vector<uint8_t> tls_cert;
    std::vector<uint8_t> tls_key;
    std::string tls_passphrase;
  };

  struct PendingSend {
    std::vector<uint8_t> data;
  };

 // Napi surface
  Napi::Value Connect(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Recv(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);

  void ServiceLoop();
  void Stop();
  void EnqueueSend(const uint8_t* data, size_t len);

  Options ParseOptions(const Napi::CallbackInfo& info);

  std::atomic<bool> connected_{false};
  std::atomic<bool> closing_{false};
  struct lws_context* context_ = nullptr;
  struct lws* wsi_ = nullptr;
  std::thread service_thread_;
  std::mutex mutex_;
  std::condition_variable recv_cv_;
  std::deque<std::vector<uint8_t>> recv_queue_;
  std::deque<PendingSend> send_queue_;
  std::vector<uint8_t> tls_ca_;
  std::vector<uint8_t> tls_cert_;
  std::vector<uint8_t> tls_key_;
  std::string tls_passphrase_;
  std::string tls_alpn_;
  bool tls_reject_unauthorized_ = true;
  std::string tls_server_name_;
};

static LwsClientWrapper* GetSelf(struct lws* wsi) {
  return static_cast<LwsClientWrapper*>(lws_get_opaque_user_data(wsi));
}

static struct lws_protocols kProtocols[] = {
    {
        "qwormhole-raw",
        LwsClientWrapper::Callback,
        0,
        0,
    },
    {nullptr, nullptr, 0, 0},
};

LwsClientWrapper::LwsClientWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<LwsClientWrapper>(info) {}

LwsClientWrapper::~LwsClientWrapper() { Stop(); }

Napi::Object LwsClientWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func =
      DefineClass(env, "TcpClientWrapper",
                  {
                      InstanceMethod<&LwsClientWrapper::Connect>("connect"),
                      InstanceMethod<&LwsClientWrapper::Send>("send"),
                      InstanceMethod<&LwsClientWrapper::Recv>("recv"),
                      InstanceMethod<&LwsClientWrapper::Close>("close"),
                  });

  exports.Set("TcpClientWrapper", func);
  return exports;
}

LwsClientWrapper::Options LwsClientWrapper::ParseOptions(
    const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Options opts;

  if (info.Length() == 0) {
    Napi::TypeError::New(env, "connect(host, port) or connect(options) required")
        .ThrowAsJavaScriptException();
    return opts;
  }

  if (info[0].IsObject()) {
    Napi::Object obj = info[0].As<Napi::Object>();
    if (!obj.Has("host") || !obj.Has("port")) {
      Napi::TypeError::New(env, "options.host and options.port required")
          .ThrowAsJavaScriptException();
      return opts;
    }
    opts.host = obj.Get("host").As<Napi::String>().Utf8Value();
    opts.port = static_cast<uint16_t>(obj.Get("port").As<Napi::Number>().Uint32Value());
    if (obj.Has("useTls")) {
      opts.use_tls = obj.Get("useTls").As<Napi::Boolean>().Value();
    }
    if (obj.Has("tlsRejectUnauthorized")) {
      opts.reject_unauthorized =
          obj.Get("tlsRejectUnauthorized").As<Napi::Boolean>().Value();
    }
    if (obj.Has("tlsServername") && obj.Get("tlsServername").IsString()) {
      opts.server_name = obj.Get("tlsServername").As<Napi::String>().Utf8Value();
    }
    if (obj.Has("tlsAlpn") && obj.Get("tlsAlpn").IsString()) {
      opts.alpn_list = obj.Get("tlsAlpn").As<Napi::String>().Utf8Value();
    }
    if (obj.Has("tlsPassphrase") && obj.Get("tlsPassphrase").IsString()) {
      opts.tls_passphrase = obj.Get("tlsPassphrase").As<Napi::String>().Utf8Value();
    }

    auto assignBuffer = [&](const char* prop, std::vector<uint8_t>& target) {
      if (!obj.Has(prop)) return;
      Napi::Value value = obj.Get(prop);
      if (value.IsBuffer()) {
        auto buf = value.As<Napi::Buffer<uint8_t>>();
        target.assign(buf.Data(), buf.Data() + buf.Length());
        return;
      }
      if (value.IsString()) {
        auto str = value.As<Napi::String>().Utf8Value();
        target.assign(str.begin(), str.end());
      }
    };

    assignBuffer("tlsCa", opts.tls_ca);
    assignBuffer("tlsCert", opts.tls_cert);
    assignBuffer("tlsKey", opts.tls_key);

    if (!opts.use_tls && (!opts.tls_ca.empty() || !opts.tls_cert.empty() ||
                          !opts.tls_key.empty())) {
      opts.use_tls = true;
    }
    return opts;
  }

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "connect(host: string, port: number) required")
        .ThrowAsJavaScriptException();
    return opts;
  }

  opts.host = info[0].As<Napi::String>().Utf8Value();
  opts.port = static_cast<uint16_t>(info[1].As<Napi::Number>().Uint32Value());
  return opts;
}

Napi::Value LwsClientWrapper::Connect(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (context_ || service_thread_.joinable()) {
    Napi::Error::New(env, "Client already connected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Options opts = ParseOptions(info);
  if (env.IsExceptionPending()) {
    return env.Undefined();
  }

  tls_ca_ = std::move(opts.tls_ca);
  tls_cert_ = std::move(opts.tls_cert);
  tls_key_ = std::move(opts.tls_key);
  tls_passphrase_ = std::move(opts.tls_passphrase);
  tls_alpn_ = std::move(opts.alpn_list);
  tls_reject_unauthorized_ = opts.reject_unauthorized;
  tls_server_name_ = std::move(opts.server_name);

  closing_ = false;
  connected_ = false;

  struct lws_context_creation_info cinfo;
  std::memset(&cinfo, 0, sizeof cinfo);
  cinfo.port = CONTEXT_PORT_NO_LISTEN;
  cinfo.protocols = kProtocols;
  cinfo.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;
  cinfo.pt_serv_buf_size = 16 * 1024;

  context_ = lws_create_context(&cinfo);
  if (!context_) {
    Napi::Error::New(env, "Failed to create libwebsockets context")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  struct lws_client_connect_info ccinfo;
  std::memset(&ccinfo, 0, sizeof ccinfo);
  ccinfo.context = context_;
  ccinfo.address = opts.host.c_str();
  const char* host_header = tls_server_name_.empty() ? opts.host.c_str()
                                                     : tls_server_name_.c_str();
  ccinfo.host = host_header;
  ccinfo.port = opts.port;
  ccinfo.path = "/";
  ccinfo.local_protocol_name = "qwormhole-raw";
  ccinfo.protocol = "raw";
  ccinfo.userdata = nullptr;
  ccinfo.opaque_user_data = this;
  ccinfo.method = "RAW";
  int ssl_flags = opts.use_tls ? LCCSCF_USE_SSL : 0;
  if (opts.use_tls && !tls_reject_unauthorized_) {
    ssl_flags |= LCCSCF_ALLOW_SELFSIGNED |
                 LCCSCF_SKIP_SERVER_CERT_HOSTNAME_CHECK |
                 LCCSCF_ALLOW_INSECURE;
  }
  ccinfo.ssl_connection = ssl_flags;
  if (!tls_alpn_.empty()) {
    ccinfo.alpn = tls_alpn_.c_str();
  } else {
    ccinfo.alpn = opts.use_tls ? "http/1.1" : nullptr;
  }
  ccinfo.pwsi = &wsi_;

  if (!tls_passphrase_.empty()) {
    cinfo.client_ssl_private_key_password = tls_passphrase_.c_str();
  } else {
    cinfo.client_ssl_private_key_password = nullptr;
  }
  if (!tls_cert_.empty()) {
    cinfo.client_ssl_cert_mem = tls_cert_.data();
    cinfo.client_ssl_cert_mem_len =
        static_cast<unsigned int>(tls_cert_.size());
  }
  if (!tls_key_.empty()) {
    cinfo.client_ssl_key_mem = tls_key_.data();
    cinfo.client_ssl_key_mem_len =
        static_cast<unsigned int>(tls_key_.size());
  }
  if (!tls_ca_.empty()) {
    cinfo.client_ssl_ca_mem = tls_ca_.data();
    cinfo.client_ssl_ca_mem_len =
        static_cast<unsigned int>(tls_ca_.size());
  }

  if (!lws_client_connect_via_info(&ccinfo)) {
    lws_context_destroy(context_);
    context_ = nullptr;
    Napi::Error::New(env, "Failed to connect via libwebsockets")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  service_thread_ = std::thread(&LwsClientWrapper::ServiceLoop, this);

  return env.Undefined();
}

void LwsClientWrapper::ServiceLoop() {
  while (!closing_) {
    int result = lws_service(context_, 50);
    if (result < 0) {
      break;
    }
  }

  connected_ = false;
}

void LwsClientWrapper::Stop() {
  closing_ = true;

  if (context_) {
    lws_cancel_service(context_);
  }

  if (service_thread_.joinable()) {
    service_thread_.join();
  }

  if (context_) {
    lws_context_destroy(context_);
    context_ = nullptr;
  }

  wsi_ = nullptr;

  std::lock_guard<std::mutex> lock(mutex_);
  recv_queue_.clear();
  send_queue_.clear();
}

void LwsClientWrapper::EnqueueSend(const uint8_t* data, size_t len) {
  if (!data || len == 0) {
    return;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  PendingSend pending;
  pending.data.assign(data, data + len);
  send_queue_.push_back(std::move(pending));
}

Napi::Value LwsClientWrapper::Send(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!context_ || closing_) {
    Napi::Error::New(env, "Client is not connected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "send(data: Buffer|string) required")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info[0].IsBuffer()) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    EnqueueSend(buf.Data(), buf.Length());
  } else {
    std::string data = info[0].ToString();
    EnqueueSend(reinterpret_cast<const uint8_t*>(data.data()), data.size());
  }

  if (wsi_) {
    lws_callback_on_writable(wsi_);
  }
  lws_cancel_service(context_);

  return env.Undefined();
}

Napi::Value LwsClientWrapper::Recv(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  size_t limit = 0;
  if (info.Length() >= 1 && info[0].IsNumber()) {
    limit = info[0].As<Napi::Number>().Uint32Value();
  }

  std::vector<uint8_t> data;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (recv_queue_.empty()) {
      return Napi::Buffer<uint8_t>::New(env, 0);
    }
    data = std::move(recv_queue_.front());
    recv_queue_.pop_front();
  }

  if (limit > 0 && data.size() > limit) {
    data.resize(limit);
  }

  return Napi::Buffer<uint8_t>::Copy(env,
                                     reinterpret_cast<const uint8_t*>(data.data()),
                                     data.size());
}

Napi::Value LwsClientWrapper::Close(const Napi::CallbackInfo& info) {
  Stop();
  return info.Env().Undefined();
}

int LwsClientWrapper::Callback(struct lws* wsi,
                               enum lws_callback_reasons reason,
                               void* user, void* in, size_t len) {
  (void)user;

  auto* self = GetSelf(wsi);

  switch (reason) {
    case LWS_CALLBACK_RAW_CONNECTED:
      if (!self) {
        lws_set_opaque_user_data(wsi, nullptr);
      } else {
        lws_set_opaque_user_data(wsi, self);
        self->connected_ = true;
        std::lock_guard<std::mutex> lock(self->mutex_);
        if (!self->send_queue_.empty()) {
          lws_callback_on_writable(wsi);
        }
      }
      break;

    case LWS_CALLBACK_RAW_RX:
      if (self && in && len > 0) {
        std::lock_guard<std::mutex> lock(self->mutex_);
        auto* ptr = static_cast<uint8_t*>(in);
        self->recv_queue_.emplace_back(ptr, ptr + len);
        self->recv_cv_.notify_all();
      }
      break;

    case LWS_CALLBACK_RAW_WRITEABLE:
      if (self) {
        PendingSend next;
        {
          std::lock_guard<std::mutex> lock(self->mutex_);
          if (self->send_queue_.empty()) {
            break;
          }
          next = std::move(self->send_queue_.front());
          self->send_queue_.pop_front();
        }

        if (!next.data.empty()) {
          std::vector<uint8_t> buffer(LWS_PRE + next.data.size());
          std::memcpy(buffer.data() + LWS_PRE, next.data.data(), next.data.size());
          ssize_t written =
              lws_write(wsi, buffer.data() + LWS_PRE,
                        next.data.size(), LWS_WRITE_RAW);
          if (written < 0) {
            self->closing_ = true;
            lws_cancel_service(self->context_);
          } else if (!self->send_queue_.empty()) {
            lws_callback_on_writable(wsi);
          }
        }
      }
      break;

    case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
    case LWS_CALLBACK_RAW_CLOSE:
    case LWS_CALLBACK_WSI_DESTROY:
      if (self) {
        self->closing_ = true;
        self->connected_ = false;
        lws_cancel_service(self->context_);
      }
      break;

    default:
      break;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// LwsServerWrapper - Native server implementation using libwebsockets
// ---------------------------------------------------------------------------

class LwsServerWrapper : public Napi::ObjectWrap<LwsServerWrapper> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit LwsServerWrapper(const Napi::CallbackInfo& info);
  ~LwsServerWrapper() override;

  static int ServerCallback(struct lws* wsi, enum lws_callback_reasons reason,
                            void* user, void* in, size_t len);

 private:
  struct ServerOptions {
    std::string host;
    uint16_t port = 0;
    bool use_tls = false;
    bool request_cert = false;
    bool reject_unauthorized = true;
    std::string alpn_list;
    std::vector<uint8_t> tls_ca;
    std::vector<uint8_t> tls_cert;
    std::vector<uint8_t> tls_key;
    std::string tls_passphrase;
    size_t max_backpressure_bytes = 5 * 1024 * 1024;
  };

  struct ClientConnection {
    std::string id;
    struct lws* wsi;
    std::string remote_address;
    uint16_t remote_port;
    std::deque<std::vector<uint8_t>> send_queue;
    size_t queued_bytes;
    bool backpressured;
  };

  // N-API methods
  Napi::Value Listen(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value Broadcast(const Napi::CallbackInfo& info);
  Napi::Value Shutdown(const Napi::CallbackInfo& info);
  Napi::Value GetConnection(const Napi::CallbackInfo& info);
  Napi::Value GetConnectionCount(const Napi::CallbackInfo& info);

  void ServiceLoop();
  void Stop();
  std::string GenerateId();
  ServerOptions ParseServerOptions(const Napi::CallbackInfo& info);

  void EmitEvent(const std::string& event, Napi::Object payload);
  void EmitListening(uint16_t port);
  void EmitConnection(const std::string& client_id);
  void EmitMessage(const std::string& client_id, const std::vector<uint8_t>& data);
  void EmitClientClosed(const std::string& client_id, bool had_error);
  void EmitError(const std::string& message);
  void EmitBackpressure(const std::string& client_id, size_t queued_bytes, size_t threshold);
  void EmitDrain(const std::string& client_id);
  void EmitClose();

  std::atomic<bool> listening_{false};
  std::atomic<bool> closing_{false};
  struct lws_context* context_ = nullptr;
  std::thread service_thread_;
  std::mutex mutex_;
  std::map<struct lws*, std::shared_ptr<ClientConnection>> connections_;
  std::map<std::string, std::shared_ptr<ClientConnection>> connections_by_id_;
  ServerOptions options_;
  uint64_t next_id_ = 0;

  // Thread-safe function for emitting events to JS
  Napi::ThreadSafeFunction tsfn_;
  Napi::ObjectReference self_ref_;
};

static struct lws_protocols kServerProtocols[] = {
    {
        "qwormhole-server",
        LwsServerWrapper::ServerCallback,
        0,
        16 * 1024,
    },
    {nullptr, nullptr, 0, 0},
};

static LwsServerWrapper* GetServerSelf(struct lws* wsi) {
  struct lws_context* ctx = lws_get_context(wsi);
  return static_cast<LwsServerWrapper*>(lws_context_user(ctx));
}

LwsServerWrapper::LwsServerWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<LwsServerWrapper>(info) {
  options_ = ParseServerOptions(info);
}

LwsServerWrapper::~LwsServerWrapper() {
  Stop();
  if (!tsfn_.IsAborted()) {
    tsfn_.Release();
  }
}

Napi::Object LwsServerWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func =
      DefineClass(env, "QWormholeServerWrapper",
                  {
                      InstanceMethod<&LwsServerWrapper::Listen>("listen"),
                      InstanceMethod<&LwsServerWrapper::Close>("close"),
                      InstanceMethod<&LwsServerWrapper::Broadcast>("broadcast"),
                      InstanceMethod<&LwsServerWrapper::Shutdown>("shutdown"),
                      InstanceMethod<&LwsServerWrapper::GetConnection>("getConnection"),
                      InstanceMethod<&LwsServerWrapper::GetConnectionCount>("getConnectionCount"),
                  });

  exports.Set("QWormholeServerWrapper", func);
  return exports;
}

LwsServerWrapper::ServerOptions LwsServerWrapper::ParseServerOptions(
    const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  ServerOptions opts;

  if (info.Length() == 0 || !info[0].IsObject()) {
    return opts;
  }

  Napi::Object obj = info[0].As<Napi::Object>();

  if (obj.Has("host") && obj.Get("host").IsString()) {
    opts.host = obj.Get("host").As<Napi::String>().Utf8Value();
  }
  if (obj.Has("port") && obj.Get("port").IsNumber()) {
    opts.port = static_cast<uint16_t>(obj.Get("port").As<Napi::Number>().Uint32Value());
  }
  if (obj.Has("maxBackpressureBytes") && obj.Get("maxBackpressureBytes").IsNumber()) {
    opts.max_backpressure_bytes = obj.Get("maxBackpressureBytes").As<Napi::Number>().Int64Value();
  }

  // TLS options
  if (obj.Has("tls") && obj.Get("tls").IsObject()) {
    Napi::Object tls = obj.Get("tls").As<Napi::Object>();

    if (tls.Has("enabled") && tls.Get("enabled").IsBoolean()) {
      opts.use_tls = tls.Get("enabled").As<Napi::Boolean>().Value();
    }
    if (tls.Has("requestCert") && tls.Get("requestCert").IsBoolean()) {
      opts.request_cert = tls.Get("requestCert").As<Napi::Boolean>().Value();
    }
    if (tls.Has("rejectUnauthorized") && tls.Get("rejectUnauthorized").IsBoolean()) {
      opts.reject_unauthorized = tls.Get("rejectUnauthorized").As<Napi::Boolean>().Value();
    }
    if (tls.Has("alpnProtocols") && tls.Get("alpnProtocols").IsArray()) {
      Napi::Array protocols = tls.Get("alpnProtocols").As<Napi::Array>();
      std::string alpn;
      for (uint32_t i = 0; i < protocols.Length(); i++) {
        if (i > 0) alpn += ",";
        alpn += protocols.Get(i).As<Napi::String>().Utf8Value();
      }
      opts.alpn_list = alpn;
    }
    if (tls.Has("passphrase") && tls.Get("passphrase").IsString()) {
      opts.tls_passphrase = tls.Get("passphrase").As<Napi::String>().Utf8Value();
    }

    auto assignBuffer = [&](const char* prop, std::vector<uint8_t>& target) {
      if (!tls.Has(prop)) return;
      Napi::Value value = tls.Get(prop);
      if (value.IsBuffer()) {
        auto buf = value.As<Napi::Buffer<uint8_t>>();
        target.assign(buf.Data(), buf.Data() + buf.Length());
      } else if (value.IsString()) {
        auto str = value.As<Napi::String>().Utf8Value();
        target.assign(str.begin(), str.end());
      }
    };

    assignBuffer("ca", opts.tls_ca);
    assignBuffer("cert", opts.tls_cert);
    assignBuffer("key", opts.tls_key);

    if (!opts.tls_cert.empty() || !opts.tls_key.empty()) {
      opts.use_tls = true;
    }
  }

  return opts;
}

std::string LwsServerWrapper::GenerateId() {
  std::lock_guard<std::mutex> lock(mutex_);
  return "conn-" + std::to_string(++next_id_);
}

Napi::Value LwsServerWrapper::Listen(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (listening_ || context_) {
    auto deferred = Napi::Promise::Deferred::New(env);
    deferred.Reject(Napi::Error::New(env, "Server already listening").Value());
    return deferred.Promise();
  }

  // Store reference to self for event emission
  self_ref_ = Napi::ObjectReference::New(info.This().As<Napi::Object>(), 1);

  // Create thread-safe function for emitting events
  tsfn_ = Napi::ThreadSafeFunction::New(
      env,
      Napi::Function::New(env, [](const Napi::CallbackInfo&) {}),
      "QWormholeServerEvents",
      0,
      1);

  closing_ = false;

  struct lws_context_creation_info cinfo;
  std::memset(&cinfo, 0, sizeof cinfo);
  cinfo.port = options_.port;
  cinfo.protocols = kServerProtocols;
  cinfo.user = this;
  cinfo.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;
  cinfo.pt_serv_buf_size = 16 * 1024;

  if (!options_.host.empty() && options_.host != "0.0.0.0") {
    cinfo.iface = options_.host.c_str();
  }

  // TLS configuration
  if (options_.use_tls) {
    cinfo.options |= LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;

    if (!options_.tls_cert.empty()) {
      cinfo.server_ssl_cert_mem = options_.tls_cert.data();
      cinfo.server_ssl_cert_mem_len = static_cast<unsigned int>(options_.tls_cert.size());
    }
    if (!options_.tls_key.empty()) {
      cinfo.server_ssl_private_key_mem = options_.tls_key.data();
      cinfo.server_ssl_private_key_mem_len = static_cast<unsigned int>(options_.tls_key.size());
    }
    if (!options_.tls_ca.empty()) {
      cinfo.server_ssl_ca_mem = options_.tls_ca.data();
      cinfo.server_ssl_ca_mem_len = static_cast<unsigned int>(options_.tls_ca.size());
    }
    if (!options_.tls_passphrase.empty()) {
      cinfo.server_ssl_private_key_password = options_.tls_passphrase.c_str();
    }
    if (options_.request_cert) {
      cinfo.options |= LWS_SERVER_OPTION_REQUIRE_VALID_OPENSSL_CLIENT_CERT;
    }
  }

  context_ = lws_create_context(&cinfo);
  if (!context_) {
    auto deferred = Napi::Promise::Deferred::New(env);
    deferred.Reject(Napi::Error::New(env, "Failed to create server context").Value());
    return deferred.Promise();
  }

  listening_ = true;
  service_thread_ = std::thread(&LwsServerWrapper::ServiceLoop, this);

  // Return address info
  auto deferred = Napi::Promise::Deferred::New(env);
  Napi::Object address = Napi::Object::New(env);
  address.Set("address", options_.host.empty() ? "0.0.0.0" : options_.host);
  address.Set("port", options_.port);
  address.Set("family", "IPv4");
  deferred.Resolve(address);

  EmitListening(options_.port);

  return deferred.Promise();
}

void LwsServerWrapper::ServiceLoop() {
  while (!closing_ && listening_) {
    int result = lws_service(context_, 50);
    if (result < 0) {
      break;
    }
  }
  listening_ = false;
}

void LwsServerWrapper::Stop() {
  closing_ = true;
  listening_ = false;

  if (context_) {
    lws_cancel_service(context_);
  }

  if (service_thread_.joinable()) {
    service_thread_.join();
  }

  {
    std::lock_guard<std::mutex> lock(mutex_);
    connections_.clear();
    connections_by_id_.clear();
  }

  if (context_) {
    lws_context_destroy(context_);
    context_ = nullptr;
  }
}

Napi::Value LwsServerWrapper::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Stop();
  EmitClose();

  auto deferred = Napi::Promise::Deferred::New(env);
  deferred.Resolve(env.Undefined());
  return deferred.Promise();
}

Napi::Value LwsServerWrapper::Broadcast(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "broadcast(data) required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::vector<uint8_t> data;
  if (info[0].IsBuffer()) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    data.assign(buf.Data(), buf.Data() + buf.Length());
  } else if (info[0].IsString()) {
    std::string str = info[0].As<Napi::String>().Utf8Value();
    data.assign(str.begin(), str.end());
  } else {
    // Serialize object to JSON
    Napi::Object global = env.Global();
    Napi::Object json = global.Get("JSON").As<Napi::Object>();
    Napi::Function stringify = json.Get("stringify").As<Napi::Function>();
    std::string str = stringify.Call(json, {info[0]}).As<Napi::String>().Utf8Value();
    data.assign(str.begin(), str.end());
  }

  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& [wsi, conn] : connections_) {
      conn->send_queue.push_back(data);
      conn->queued_bytes += data.size();
      lws_callback_on_writable(wsi);
    }
  }

  if (context_) {
    lws_cancel_service(context_);
  }

  return env.Undefined();
}

Napi::Value LwsServerWrapper::Shutdown(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  int graceful_ms = 1000;
  if (info.Length() >= 1 && info[0].IsNumber()) {
    graceful_ms = info[0].As<Napi::Number>().Int32Value();
  }

  // For now, just do immediate shutdown
  // TODO: Implement graceful shutdown with timeout
  Stop();
  EmitClose();

  auto deferred = Napi::Promise::Deferred::New(env);
  deferred.Resolve(env.Undefined());
  return deferred.Promise();
}

Napi::Value LwsServerWrapper::GetConnection(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    return env.Undefined();
  }

  std::string id = info[0].As<Napi::String>().Utf8Value();

  std::lock_guard<std::mutex> lock(mutex_);
  auto it = connections_by_id_.find(id);
  if (it == connections_by_id_.end()) {
    return env.Undefined();
  }

  Napi::Object conn = Napi::Object::New(env);
  conn.Set("id", it->second->id);
  conn.Set("remoteAddress", it->second->remote_address);
  conn.Set("remotePort", it->second->remote_port);
  return conn;
}

Napi::Value LwsServerWrapper::GetConnectionCount(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(mutex_);
  return Napi::Number::New(info.Env(), static_cast<double>(connections_.size()));
}

// Event emission helpers
void LwsServerWrapper::EmitListening(uint16_t port) {
  if (tsfn_.IsAborted()) return;

  auto callback = [this, port](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();
      Napi::Object address = Napi::Object::New(env);
      address.Set("address", options_.host.empty() ? "0.0.0.0" : options_.host);
      address.Set("port", port);
      address.Set("family", "IPv4");
      emit.Call(self, {Napi::String::New(env, "listening"), address});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitConnection(const std::string& client_id) {
  if (tsfn_.IsAborted()) return;

  auto callback = [this, client_id](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();

      std::lock_guard<std::mutex> lock(mutex_);
      auto it = connections_by_id_.find(client_id);
      if (it == connections_by_id_.end()) return;

      Napi::Object conn = Napi::Object::New(env);
      conn.Set("id", it->second->id);
      conn.Set("remoteAddress", it->second->remote_address);
      conn.Set("remotePort", it->second->remote_port);
      emit.Call(self, {Napi::String::New(env, "connection"), conn});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitMessage(const std::string& client_id, const std::vector<uint8_t>& data) {
  if (tsfn_.IsAborted()) return;

  auto callback = [this, client_id, data](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();

      std::lock_guard<std::mutex> lock(mutex_);
      auto it = connections_by_id_.find(client_id);
      if (it == connections_by_id_.end()) return;

      Napi::Object payload = Napi::Object::New(env);
      Napi::Object client = Napi::Object::New(env);
      client.Set("id", it->second->id);
      client.Set("remoteAddress", it->second->remote_address);
      client.Set("remotePort", it->second->remote_port);
      payload.Set("client", client);
      payload.Set("data", Napi::Buffer<uint8_t>::Copy(env, data.data(), data.size()));
      emit.Call(self, {Napi::String::New(env, "message"), payload});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitClientClosed(const std::string& client_id, bool had_error) {
  if (tsfn_.IsAborted()) return;

  auto callback = [this, client_id, had_error](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();

      Napi::Object payload = Napi::Object::New(env);
      Napi::Object client = Napi::Object::New(env);
      client.Set("id", client_id);
      payload.Set("client", client);
      payload.Set("hadError", had_error);
      emit.Call(self, {Napi::String::New(env, "clientClosed"), payload});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitError(const std::string& message) {
  if (tsfn_.IsAborted()) return;

  auto callback = [this, message](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();
      Napi::Error error = Napi::Error::New(env, message);
      emit.Call(self, {Napi::String::New(env, "error"), error.Value()});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitBackpressure(const std::string& client_id, size_t queued_bytes, size_t threshold) {
  if (tsfn_.IsAborted()) return;

  auto callback = [this, client_id, queued_bytes, threshold](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();

      std::lock_guard<std::mutex> lock(mutex_);
      auto it = connections_by_id_.find(client_id);
      if (it == connections_by_id_.end()) return;

      Napi::Object payload = Napi::Object::New(env);
      Napi::Object client = Napi::Object::New(env);
      client.Set("id", client_id);
      payload.Set("client", client);
      payload.Set("queuedBytes", static_cast<double>(queued_bytes));
      payload.Set("threshold", static_cast<double>(threshold));
      emit.Call(self, {Napi::String::New(env, "backpressure"), payload});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitDrain(const std::string& client_id) {
  if (tsfn_.IsAborted()) return;

  auto callback = [this, client_id](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();

      std::lock_guard<std::mutex> lock(mutex_);
      auto it = connections_by_id_.find(client_id);
      if (it == connections_by_id_.end()) return;

      Napi::Object payload = Napi::Object::New(env);
      Napi::Object client = Napi::Object::New(env);
      client.Set("id", client_id);
      payload.Set("client", client);
      emit.Call(self, {Napi::String::New(env, "drain"), payload});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitClose() {
  if (tsfn_.IsAborted()) return;

  auto callback = [this](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();
      emit.Call(self, {Napi::String::New(env, "close"), env.Undefined()});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

int LwsServerWrapper::ServerCallback(struct lws* wsi,
                                     enum lws_callback_reasons reason,
                                     void* user, void* in, size_t len) {
  (void)user;

  auto* self = GetServerSelf(wsi);
  if (!self) return 0;

  switch (reason) {
    case LWS_CALLBACK_RAW_ADOPT: {
      // New connection accepted
      std::string id = self->GenerateId();

      char peer_name[128] = {0};
      lws_get_peer_simple(wsi, peer_name, sizeof(peer_name));

      auto conn = std::make_shared<ClientConnection>();
      conn->id = id;
      conn->wsi = wsi;
      conn->remote_address = peer_name;
      conn->remote_port = 0; // libwebsockets doesn't easily expose this
      conn->queued_bytes = 0;
      conn->backpressured = false;

      {
        std::lock_guard<std::mutex> lock(self->mutex_);
        self->connections_[wsi] = conn;
        self->connections_by_id_[id] = conn;
      }

      self->EmitConnection(id);
      break;
    }

    case LWS_CALLBACK_RAW_RX: {
      if (in && len > 0) {
        std::string client_id;
        {
          std::lock_guard<std::mutex> lock(self->mutex_);
          auto it = self->connections_.find(wsi);
          if (it != self->connections_.end()) {
            client_id = it->second->id;
          }
        }
        if (!client_id.empty()) {
          std::vector<uint8_t> data(static_cast<uint8_t*>(in),
                                    static_cast<uint8_t*>(in) + len);
          self->EmitMessage(client_id, data);
        }
      }
      break;
    }

    case LWS_CALLBACK_RAW_WRITEABLE: {
      std::shared_ptr<ClientConnection> conn;
      {
        std::lock_guard<std::mutex> lock(self->mutex_);
        auto it = self->connections_.find(wsi);
        if (it != self->connections_.end()) {
          conn = it->second;
        }
      }

      if (conn && !conn->send_queue.empty()) {
        auto data = conn->send_queue.front();
        conn->send_queue.pop_front();
        conn->queued_bytes -= data.size();

        std::vector<uint8_t> buffer(LWS_PRE + data.size());
        std::memcpy(buffer.data() + LWS_PRE, data.data(), data.size());
        ssize_t written = lws_write(wsi, buffer.data() + LWS_PRE,
                                    data.size(), LWS_WRITE_RAW);

        if (written < 0) {
          // Write failed, close connection
          return -1;
        }

        if (!conn->send_queue.empty()) {
          lws_callback_on_writable(wsi);
        } else if (conn->backpressured) {
          conn->backpressured = false;
          self->EmitDrain(conn->id);
        }
      }
      break;
    }

    case LWS_CALLBACK_RAW_CLOSE: {
      std::string client_id;
      {
        std::lock_guard<std::mutex> lock(self->mutex_);
        auto it = self->connections_.find(wsi);
        if (it != self->connections_.end()) {
          client_id = it->second->id;
          self->connections_by_id_.erase(client_id);
          self->connections_.erase(it);
        }
      }
      if (!client_id.empty()) {
        self->EmitClientClosed(client_id, false);
      }
      break;
    }

    default:
      break;
  }

  return 0;
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  LwsClientWrapper::Init(env, exports);
  LwsServerWrapper::Init(env, exports);
  return exports;
}

}  // namespace

NODE_API_MODULE(qwormhole_lws, InitAll)
