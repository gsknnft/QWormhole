#include <napi.h>
#include <inetclientstream.hpp>
#include <exception.hpp>
#include <libinetsocket.h>

namespace {
class TcpClientWrapper : public Napi::ObjectWrap<TcpClientWrapper> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit TcpClientWrapper(const Napi::CallbackInfo& info);

 private:
  libsocket::inet_stream client_;

  Napi::Value Connect(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Recv(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
};

Napi::Object TcpClientWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "TcpClientWrapper",
      {
          InstanceMethod<&TcpClientWrapper::Connect>("connect"),
          InstanceMethod<&TcpClientWrapper::Send>("send"),
          InstanceMethod<&TcpClientWrapper::Recv>("recv"),
          InstanceMethod<&TcpClientWrapper::Close>("close"),
      });

  exports.Set("TcpClientWrapper", func);
  return exports;
}

TcpClientWrapper::TcpClientWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<TcpClientWrapper>(info) {}

Napi::Value TcpClientWrapper::Connect(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "connect(host: string, port: number) required").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string host = info[0].As<Napi::String>();
  auto port_num = info[1].As<Napi::Number>().Uint32Value();
  std::string port = std::to_string(port_num);

  try {
    client_.connect(host, port, LIBSOCKET_IPv4, 0);
  } catch (const libsocket::socket_exception& ex) {
    Napi::Error::New(env, ex.mesg).ThrowAsJavaScriptException();
  } catch (const std::exception& ex) {
    Napi::Error::New(env, ex.what()).ThrowAsJavaScriptException();
  }

  return env.Undefined();
}

Napi::Value TcpClientWrapper::Send(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "send(data: Buffer|string) required").ThrowAsJavaScriptException();
    return env.Null();
  }

  try {
    if (info[0].IsBuffer()) {
      auto buf = info[0].As<Napi::Buffer<char>>();
      client_.snd(buf.Data(), buf.Length());
    } else {
      std::string data = info[0].ToString();
      client_.snd(data.data(), data.size());
    }
  } catch (const libsocket::socket_exception& ex) {
    Napi::Error::New(env, ex.mesg).ThrowAsJavaScriptException();
  } catch (const std::exception& ex) {
    Napi::Error::New(env, ex.what()).ThrowAsJavaScriptException();
  }

  return env.Undefined();
}

Napi::Value TcpClientWrapper::Recv(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  size_t length = 4096;
  if (info.Length() >= 1 && info[0].IsNumber()) {
    length = info[0].As<Napi::Number>().Uint32Value();
  }

  std::string buffer;
  buffer.resize(length);

  ssize_t received = 0;
  try {
    received = client_.rcv(&buffer[0], length, 0);
  } catch (const libsocket::socket_exception& ex) {
    Napi::Error::New(env, ex.mesg).ThrowAsJavaScriptException();
    return env.Null();
  } catch (const std::exception& ex) {
    Napi::Error::New(env, ex.what()).ThrowAsJavaScriptException();
    return env.Null();
  }

  if (received <= 0) {
    return Napi::Buffer<char>::New(env, 0);
  }

  return Napi::Buffer<char>::Copy(env, buffer.data(), received);
}

Napi::Value TcpClientWrapper::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  try {
    client_.destroy();
  } catch (const libsocket::socket_exception& ex) {
    Napi::Error::New(env, ex.mesg).ThrowAsJavaScriptException();
  } catch (const std::exception& ex) {
    Napi::Error::New(env, ex.what()).ThrowAsJavaScriptException();
  }

  return env.Undefined();
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return TcpClientWrapper::Init(env, exports);
}
}  // namespace

NODE_API_MODULE(qwormhole, InitAll)
