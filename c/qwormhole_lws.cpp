#include <napi.h>
#include <libwebsockets.h>

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <deque>
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

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return LwsClientWrapper::Init(env, exports);
}

}  // namespace

NODE_API_MODULE(qwormhole_lws, InitAll)
