#include <napi.h>
#include <libwebsockets.h>
#include <openssl/evp.h>
#include <openssl/sha.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#endif

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cctype>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <deque>
#include <iomanip>
#include <limits>
#include <map>
#include <mutex>
#include <memory>
#include <optional>
#include <random>
#include <sstream>
#include <string>
#include <thread>
#include <variant>
#include <vector>

namespace {

constexpr const char kServerVhostName[] = "qwormhole-native-server";
constexpr const char kDefaultVhostName[] = "default";

constexpr size_t kFrameHeaderBytes = 4;
constexpr size_t kDefaultMaxFrameLength = 4 * 1024 * 1024;

enum class JsonType { Null, Boolean, Number, String, Object, Array };

struct JsonValue {
  JsonType type = JsonType::Null;
  double number_value = 0.0;
  bool bool_value = false;
  std::string string_value;
  std::map<std::string, JsonValue> object_value;
  std::vector<JsonValue> array_value;
};

class SimpleJsonParser {
 public:
  explicit SimpleJsonParser(const std::string& input) : input_(input) {}

  bool Parse(JsonValue* out, std::string* error) {
    pos_ = 0;
    SkipWhitespace();
    if (!ParseValue(out, error)) {
      return false;
    }
    SkipWhitespace();
    if (pos_ != input_.size()) {
      if (error) {
        *error = "Trailing data in JSON payload";
      }
      return false;
    }
    return true;
  }

  bool ParseValue(JsonValue* out, std::string* error) {
    if (pos_ >= input_.size()) {
      if (error) *error = "Unexpected end of JSON input";
      return false;
    }

    char ch = input_[pos_];
    if (ch == '{') {
      return ParseObject(out, error);
    }
    if (ch == '[') {
      return ParseArray(out, error);
    }
    if (ch == '"') {
      std::string value;
      if (!ParseString(&value, error)) {
        return false;
      }
      out->type = JsonType::String;
      out->string_value = std::move(value);
      return true;
    }
    if (ch == '-' || (ch >= '0' && ch <= '9')) {
      return ParseNumber(out, error);
    }
    return ParseLiteral(out, error);
  }

  bool ParseObject(JsonValue* out, std::string* error) {
    if (!Match('{')) {
      if (error) {
        *error = "Expected '{'";
      }
      return false;
    }
    out->type = JsonType::Object;
    out->object_value.clear();
    SkipWhitespace();
    if (Match('}')) {
      return true;
    }
    while (true) {
      std::string key;
      if (!ParseString(&key, error)) {
        return false;
      }
      SkipWhitespace();
      if (!Match(':')) {
        if (error) {
          *error = "Expected ':' after object key";
        }
        return false;
      }
      SkipWhitespace();
      JsonValue value;
      if (!ParseValue(&value, error)) {
        return false;
      }
      out->object_value.emplace(std::move(key), std::move(value));
      SkipWhitespace();
      if (Match('}')) {
        break;
      }
      if (!Match(',')) {
        if (error) {
          *error = "Expected ',' between object entries";
        }
        return false;
      }
      SkipWhitespace();
    }
    return true;
  }

  bool ParseArray(JsonValue* out, std::string* error) {
    if (!Match('[')) {
      if (error) *error = "Expected '['";
      return false;
    }
    out->type = JsonType::Array;
    out->array_value.clear();
    SkipWhitespace();
    if (Match(']')) {
      return true;
    }
    while (true) {
      JsonValue value;
      if (!ParseValue(&value, error)) {
        return false;
      }
      out->array_value.push_back(std::move(value));
      SkipWhitespace();
      if (Match(']')) {
        break;
      }
      if (!Match(',')) {
        if (error) *error = "Expected ',' between array entries";
        return false;
      }
      SkipWhitespace();
    }
    return true;
  }

  bool ParseString(std::string* out, std::string* error) {
    if (!Match('"')) {
      if (error) *error = "Expected string";
      return false;
    }
    std::string result;
    while (pos_ < input_.size()) {
      char ch = input_[pos_++];
      if (ch == '"') {
        *out = std::move(result);
        return true;
      }
      if (ch == '\\') {
        if (pos_ >= input_.size()) {
          if (error) *error = "Invalid escape sequence";
          return false;
        }
        char esc = input_[pos_++];
        switch (esc) {
          case '"': result.push_back('"'); break;
          case '\\': result.push_back('\\'); break;
          case '/': result.push_back('/'); break;
          case 'b': result.push_back('\b'); break;
          case 'f': result.push_back('\f'); break;
          case 'n': result.push_back('\n'); break;
          case 'r': result.push_back('\r'); break;
          case 't': result.push_back('\t'); break;
          case 'u': {
            uint32_t codepoint = 0;
            if (!ParseUnicodeEscape(&codepoint, error)) {
              return false;
            }
            AppendUtf8(codepoint, &result);
            break;
          }
          default:
            if (error) *error = "Unknown escape sequence";
            return false;
        }
        continue;
      }
      result.push_back(ch);
    }
    if (error) *error = "Unterminated string";
    return false;
  }

  bool ParseUnicodeEscape(uint32_t* codepoint, std::string* error) {
    if (pos_ + 3 >= input_.size()) {
      if (error) *error = "Invalid unicode escape";
      return false;
    }
    uint32_t value = 0;
    for (int i = 0; i < 4; ++i) {
      char c = input_[pos_++];
      value <<= 4;
      if (c >= '0' && c <= '9') {
        value |= static_cast<uint32_t>(c - '0');
      } else if (c >= 'a' && c <= 'f') {
        value |= static_cast<uint32_t>(10 + c - 'a');
      } else if (c >= 'A' && c <= 'F') {
        value |= static_cast<uint32_t>(10 + c - 'A');
      } else {
        if (error) *error = "Invalid unicode escape";
        return false;
      }
    }
    *codepoint = value;
    return true;
  }

  void AppendUtf8(uint32_t cp, std::string* out) {
    if (cp <= 0x7F) {
      out->push_back(static_cast<char>(cp));
    } else if (cp <= 0x7FF) {
      out->push_back(static_cast<char>(0xC0 | ((cp >> 6) & 0x1F)));
      out->push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp <= 0xFFFF) {
      out->push_back(static_cast<char>(0xE0 | ((cp >> 12) & 0x0F)));
      out->push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out->push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
      out->push_back(static_cast<char>(0xF0 | ((cp >> 18) & 0x07)));
      out->push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
      out->push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out->push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
  }

  bool ParseNumber(JsonValue* out, std::string* error) {
    size_t start = pos_;
    if (input_[pos_] == '-') {
      ++pos_;
    }
    if (pos_ >= input_.size()) {
      if (error) *error = "Unexpected end in number";
      return false;
    }
    if (input_[pos_] == '0') {
      ++pos_;
    } else {
      if (!std::isdigit(static_cast<unsigned char>(input_[pos_]))) {
        if (error) *error = "Invalid number";
        return false;
      }
      while (pos_ < input_.size() &&
             std::isdigit(static_cast<unsigned char>(input_[pos_]))) {
        ++pos_;
      }
    }
    if (pos_ < input_.size() && input_[pos_] == '.') {
      ++pos_;
      if (pos_ >= input_.size() ||
          !std::isdigit(static_cast<unsigned char>(input_[pos_]))) {
        if (error) *error = "Invalid fractional part";
        return false;
      }
      while (pos_ < input_.size() &&
             std::isdigit(static_cast<unsigned char>(input_[pos_]))) {
        ++pos_;
      }
    }
    if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
      ++pos_;
      if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) {
        ++pos_;
      }
      if (pos_ >= input_.size() ||
          !std::isdigit(static_cast<unsigned char>(input_[pos_]))) {
        if (error) *error = "Invalid exponent";
        return false;
      }
      while (pos_ < input_.size() &&
             std::isdigit(static_cast<unsigned char>(input_[pos_]))) {
        ++pos_;
      }
    }

    double value = 0.0;
    try {
      value = std::stod(input_.substr(start, pos_ - start));
    } catch (const std::exception&) {
      if (error) *error = "Invalid number";
      return false;
    }
    out->type = JsonType::Number;
    out->number_value = value;
    return true;
  }

  bool ParseLiteral(JsonValue* out, std::string* error) {
    if (MatchLiteral("true")) {
      out->type = JsonType::Boolean;
      out->bool_value = true;
      return true;
    }
    if (MatchLiteral("false")) {
      out->type = JsonType::Boolean;
      out->bool_value = false;
      return true;
    }
    if (MatchLiteral("null")) {
      out->type = JsonType::Null;
      return true;
    }
    if (error) *error = "Invalid literal";
    return false;
  }

  bool Match(char expected) {
    if (pos_ < input_.size() && input_[pos_] == expected) {
      ++pos_;
      return true;
    }
    return false;
  }

  bool MatchLiteral(const char* literal) {
    size_t len = std::strlen(literal);
    if (pos_ + len > input_.size()) {
      return false;
    }
    if (input_.compare(pos_, len, literal) == 0) {
      pos_ += len;
      return true;
    }
    return false;
  }

  void SkipWhitespace() {
    while (pos_ < input_.size()) {
      char ch = input_[pos_];
      if (ch == ' ' || ch == '\n' || ch == '\r' || ch == '\t') {
        ++pos_;
      } else {
        break;
      }
    }
  }

  const std::string& input_;
  size_t pos_ = 0;
};

struct HandshakeMetadata {
  bool has_version = false;
  std::string version;
  std::map<std::string, std::variant<std::string, double>> tags;
  bool has_nindex = false;
  double nindex = 0.0;
  bool has_neghash = false;
  std::string neghash;
};

const JsonValue* GetObjectMember(const JsonValue& value, const std::string& key) {
  if (value.type != JsonType::Object) {
    return nullptr;
  }
  auto it = value.object_value.find(key);
  if (it == value.object_value.end()) {
    return nullptr;
  }
  return &it->second;
}

std::optional<std::string> GetStringMember(const JsonValue& value, const std::string& key) {
  auto member = GetObjectMember(value, key);
  if (!member || member->type != JsonType::String) {
    return std::nullopt;
  }
  return member->string_value;
}

std::optional<double> GetNumberMember(const JsonValue& value, const std::string& key) {
  auto member = GetObjectMember(value, key);
  if (!member) {
    return std::nullopt;
  }
  if (member->type == JsonType::Number) {
    return member->number_value;
  }
  if (member->type == JsonType::String) {
    try {
      return std::stod(member->string_value);
    } catch (const std::exception&) {
      return std::nullopt;
    }
  }
  return std::nullopt;
}

std::string EscapeString(const std::string& input) {
  std::string out;
  out.reserve(input.size());
  for (char ch : input) {
    switch (ch) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(ch) < 0x20) {
          std::ostringstream oss;
          oss << "\\u" << std::hex << std::uppercase << std::setw(4) << std::setfill('0')
              << static_cast<int>(static_cast<unsigned char>(ch));
          out += oss.str();
        } else {
          out.push_back(ch);
        }
        break;
    }
  }
  return out;
}

std::string FormatNumber(double value) {
  if (!std::isfinite(value) || value == 0.0) {
    return "0";
  }
  std::ostringstream oss;
  oss.setf(std::ios::fmtflags(0), std::ios::floatfield);
  oss << std::setprecision(15) << value;
  std::string out = oss.str();
  auto pos = out.find('.');
  if (pos != std::string::npos) {
    while (!out.empty() && out.back() == '0') {
      out.pop_back();
    }
    if (!out.empty() && out.back() == '.') {
      out.pop_back();
    }
    if (out.empty()) {
      out = "0";
    }
  }
  return out;
}

std::string SerializeJson(const JsonValue& value, bool skip_signature_root, bool is_root = true);

std::string SerializeArray(const JsonValue& value, bool skip_signature_root) {
  std::string out = "[";
  bool first = true;
  for (const auto& entry : value.array_value) {
    if (!first) {
      out.push_back(',');
    }
    first = false;
    out += SerializeJson(entry, skip_signature_root, false);
  }
  out.push_back(']');
  return out;
}

std::string SerializeJson(const JsonValue& value, bool skip_signature_root, bool is_root) {
  switch (value.type) {
    case JsonType::Null:
      return "null";
    case JsonType::Boolean:
      return value.bool_value ? "true" : "false";
    case JsonType::Number:
      return FormatNumber(value.number_value);
    case JsonType::String:
      return std::string("\"") + EscapeString(value.string_value) + "\"";
    case JsonType::Array:
      return SerializeArray(value, skip_signature_root);
    case JsonType::Object: {
      std::string out = "{";
      bool first = true;
      for (const auto& pair : value.object_value) {
        if (skip_signature_root && is_root && pair.first == "signature") {
          continue;
        }
        if (!first) {
          out.push_back(',');
        }
        first = false;
        out += "\"" + EscapeString(pair.first) + "\":";
        out += SerializeJson(pair.second, skip_signature_root, false);
      }
      out.push_back('}');
      return out;
    }
  }
  return "null";
}

std::string HexEncode(const unsigned char* data, size_t len) {
  static const char* hex = "0123456789abcdef";
  std::string out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; ++i) {
    out.push_back(hex[(data[i] >> 4) & 0xF]);
    out.push_back(hex[data[i] & 0xF]);
  }
  return out;
}

std::optional<std::vector<uint8_t>> Base64Decode(const std::string& input) {
  if (input.empty()) {
    return std::vector<uint8_t>();
  }
  std::vector<uint8_t> output((input.size() * 3) / 4 + 3);
  int len = EVP_DecodeBlock(output.data(),
                            reinterpret_cast<const unsigned char*>(input.data()),
                            (int)input.size());
  if (len < 0) {
    return std::nullopt;
  }
  size_t padding = 0;
  if (!input.empty() && input.back() == '=') padding++;
  if (input.size() > 1 && input[input.size() - 2] == '=') padding++;
  if ((size_t)len < padding) {
    return std::nullopt;
  }
  output.resize((size_t)len - padding);
  return output;
}

double ComputeEntropy(const std::vector<uint8_t>& data) {
  if (data.empty()) {
    return 0.0;
  }
  std::array<size_t, 256> counts = {};
  for (auto byte : data) {
    counts[byte] += 1;
  }
  double entropy = 0.0;
  const double len = static_cast<double>(data.size());
  for (auto count : counts) {
    if (!count) continue;
    double p = count / len;
    entropy -= p * std::log2(p);
  }
  return entropy;
}

double ComputeNIndex(const std::vector<uint8_t>& public_key) {
  if (public_key.empty()) {
    return 0.0;
  }
  double entropy = ComputeEntropy(public_key);
  if (entropy <= 0.0) {
    entropy = 1e-6;
  }
  double numerator = public_key.front();
  double denominator = 0.0;
  for (auto byte : public_key) {
    denominator += byte;
  }
  if (denominator <= 0.0) {
    denominator = 1.0;
  }
  double coherence = numerator / denominator;
  double result = coherence / entropy;
  if (!std::isfinite(result)) {
    return 0.0;
  }
  return std::clamp(result, 0.0, 1.0);
}

std::string DeriveNegentropicHash(const std::vector<uint8_t>& public_key,
                                   double nindex) {
  const double weight = std::clamp(nindex, 0.0, 1.0);
  const uint8_t mask = static_cast<uint8_t>(std::floor(weight * 255.0));
  std::vector<uint8_t> salted(public_key.size());
  for (size_t i = 0; i < public_key.size(); ++i) {
    salted[i] = static_cast<uint8_t>(public_key[i] ^ mask);
  }
  std::ostringstream oss;
  oss << std::fixed << std::setprecision(6) << nindex;
  auto idx_str = oss.str();

  SHA256_CTX ctx;
  SHA256_Init(&ctx);
  if (!public_key.empty()) {
    SHA256_Update(&ctx, public_key.data(), public_key.size());
  }
  if (!salted.empty()) {
    SHA256_Update(&ctx, salted.data(), salted.size());
  }
  SHA256_Update(&ctx, idx_str.data(), idx_str.size());
  unsigned char digest[SHA256_DIGEST_LENGTH];
  SHA256_Final(digest, &ctx);
  return HexEncode(digest, SHA256_DIGEST_LENGTH);
}

bool VerifyEd25519Signature(const std::vector<uint8_t>& public_key,
                            const std::vector<uint8_t>& signature,
                            const std::string& message) {
  EVP_PKEY* pkey = EVP_PKEY_new_raw_public_key(EVP_PKEY_ED25519, nullptr,
                                               public_key.data(), (int)public_key.size());
  if (!pkey) {
    return false;
  }
  EVP_MD_CTX* ctx = EVP_MD_CTX_new();
  if (!ctx) {
    EVP_PKEY_free(pkey);
    return false;
  }
  bool ok = false;
  if (EVP_DigestVerifyInit(ctx, nullptr, nullptr, nullptr, pkey) == 1) {
    if (EVP_DigestVerify(ctx, signature.data(), signature.size(),
                         reinterpret_cast<const unsigned char*>(message.data()),
                         message.size()) == 1) {
      ok = true;
    }
  }
  EVP_MD_CTX_free(ctx);
  EVP_PKEY_free(pkey);
  return ok;
}

bool LooksNegantropicHandshake(const JsonValue& root) {
  return GetObjectMember(root, "publicKey") && GetObjectMember(root, "signature") &&
         GetObjectMember(root, "negHash") && GetObjectMember(root, "nIndex");
}

bool VerifyNegantropicHandshake(const JsonValue& root,
                                HandshakeMetadata* metadata,
                                std::string* error) {
  auto public_key_b64 = GetStringMember(root, "publicKey");
  auto signature_b64 = GetStringMember(root, "signature");
  auto neg_hash = GetStringMember(root, "negHash");
  if (!public_key_b64 || !signature_b64 || !neg_hash) {
    if (error) *error = "Missing negantropic handshake fields";
    return false;
  }
  auto public_key = Base64Decode(*public_key_b64);
  auto signature = Base64Decode(*signature_b64);
  if (!public_key || !signature) {
    if (error) *error = "Invalid base64 in handshake";
    return false;
  }
  double nindex = ComputeNIndex(*public_key);
  const std::string derived_hash = DeriveNegentropicHash(*public_key, nindex);
  if (derived_hash != *neg_hash) {
    if (error) *error = "Negantropic hash mismatch";
    return false;
  }
  const std::string canonical = SerializeJson(root, true);
  if (!VerifyEd25519Signature(*public_key, *signature, canonical)) {
    if (error) *error = "Invalid handshake signature";
    return false;
  }
  metadata->has_nindex = true;
  metadata->nindex = nindex;
  metadata->has_neghash = true;
  metadata->neghash = derived_hash;
  return true;
}

HandshakeMetadata BuildHandshakeMetadata(const JsonValue& root) {
  HandshakeMetadata meta;
  if (auto version = GetStringMember(root, "version")) {
    meta.has_version = true;
    meta.version = *version;
  }
  if (auto nindex = GetNumberMember(root, "nIndex")) {
    meta.has_nindex = true;
    meta.nindex = *nindex;
  }
  if (auto neg_hash = GetStringMember(root, "negHash")) {
    meta.has_neghash = true;
    meta.neghash = *neg_hash;
  }
  auto tags_value = GetObjectMember(root, "tags");
  if (tags_value && tags_value->type == JsonType::Object) {
    for (const auto& [key, val] : tags_value->object_value) {
      if (val.type == JsonType::String) {
        meta.tags.emplace(key, val.string_value);
      } else if (val.type == JsonType::Number) {
        meta.tags.emplace(key, val.number_value);
      }
    }
  }
  return meta;
}

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
    bool length_prefixed = true;
    size_t max_frame_length = kDefaultMaxFrameLength;
    std::string protocol_version;
  };

  struct ClientConnection {
    std::string id;
    struct lws* wsi;
    std::string remote_address;
    uint16_t remote_port;
    std::deque<std::vector<uint8_t>> send_queue;
    size_t queued_bytes;
    bool backpressured;
    bool closing;
    std::vector<uint8_t> rx_buffer;
    size_t rx_offset = 0;
    bool handshake_complete = false;
    bool connection_announced = false;
    bool handshake_required = false;
    HandshakeMetadata handshake_metadata;
  };

  friend void AttachHandshakeMetadataToClient(
      Napi::Env env,
      const std::shared_ptr<ClientConnection>& conn,
      Napi::Object* target);

  // N-API methods
  Napi::Value Listen(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value Broadcast(const Napi::CallbackInfo& info);
  Napi::Value Shutdown(const Napi::CallbackInfo& info);
  Napi::Value GetConnection(const Napi::CallbackInfo& info);
  Napi::Value GetConnectionCount(const Napi::CallbackInfo& info);
  Napi::Value CloseConnection(const Napi::CallbackInfo& info);

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
  void UpdateListenMetadata();
  uint16_t EffectiveListenPort() const;
  bool ProcessIncomingData(const std::shared_ptr<ClientConnection>& conn,
                           const uint8_t* data, size_t len);
  bool ProcessBufferedFrames(const std::shared_ptr<ClientConnection>& conn);
  bool HandleHandshakeFrame(const std::shared_ptr<ClientConnection>& conn,
                            const std::vector<uint8_t>& frame);
  void TrimRxBuffer(ClientConnection* conn);
  std::vector<uint8_t> BuildFramedPayload(const std::vector<uint8_t>& data);

  std::atomic<bool> listening_{false};
  std::atomic<bool> closing_{false};
  struct lws_context* context_ = nullptr;
  struct lws_vhost* vhost_ = nullptr;
  std::thread service_thread_;
  std::mutex mutex_;
  std::map<struct lws*, std::shared_ptr<ClientConnection>> connections_;
  std::map<std::string, std::shared_ptr<ClientConnection>> connections_by_id_;
  ServerOptions options_;
  uint64_t next_id_ = 0;

  // Thread-safe function for emitting events to JS
  Napi::ThreadSafeFunction tsfn_;
  Napi::ObjectReference self_ref_;
  bool tsfn_ready_ = false;
  uint16_t listen_port_ = 0;
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

void AttachHandshakeMetadataToClient(
    Napi::Env env,
    const std::shared_ptr<LwsServerWrapper::ClientConnection>& conn,
    Napi::Object* target) {
  if (!conn || !target) {
    return;
  }
  if (!conn->handshake_complete) {
    return;
  }
  const HandshakeMetadata& meta = conn->handshake_metadata;
  if (!meta.has_version && meta.tags.empty() && !meta.has_nindex && !meta.has_neghash) {
    return;
  }
  Napi::Object handshake = Napi::Object::New(env);
  if (meta.has_version) {
    handshake.Set("version", Napi::String::New(env, meta.version));
  }
  if (!meta.tags.empty()) {
    Napi::Object tags = Napi::Object::New(env);
    for (const auto& [key, value] : meta.tags) {
      if (std::holds_alternative<std::string>(value)) {
        tags.Set(key, Napi::String::New(env, std::get<std::string>(value)));
      } else {
        tags.Set(key, Napi::Number::New(env, std::get<double>(value)));
      }
    }
    handshake.Set("tags", tags);
  }
  if (meta.has_nindex) {
    handshake.Set("nIndex", Napi::Number::New(env, meta.nindex));
  }
  if (meta.has_neghash) {
    handshake.Set("negHash", Napi::String::New(env, meta.neghash));
  }
  target->Set("handshake", handshake);
}

LwsServerWrapper::LwsServerWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<LwsServerWrapper>(info) {
  options_ = ParseServerOptions(info);
}

LwsServerWrapper::~LwsServerWrapper() {
  Stop();
  if (tsfn_ready_) {
    tsfn_.Release();
    tsfn_ready_ = false;
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
                        InstanceMethod<&LwsServerWrapper::CloseConnection>("closeConnection"),
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

  if (obj.Has("framing") && obj.Get("framing").IsString()) {
    auto framing = obj.Get("framing").As<Napi::String>().Utf8Value();
    opts.length_prefixed = framing != "none";
  }
  if (obj.Has("maxFrameLength") && obj.Get("maxFrameLength").IsNumber()) {
    opts.max_frame_length = static_cast<size_t>(
        obj.Get("maxFrameLength").As<Napi::Number>().Int64Value());
    if (opts.max_frame_length == 0) {
      opts.max_frame_length = kDefaultMaxFrameLength;
    }
  }
  if (obj.Has("protocolVersion") && obj.Get("protocolVersion").IsString()) {
    opts.protocol_version = obj.Get("protocolVersion").As<Napi::String>().Utf8Value();
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
  // Use timestamp + counter + random component for better uniqueness
  auto now = std::chrono::steady_clock::now().time_since_epoch();
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now).count();
  
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_int_distribution<uint32_t> dis(0, 0xFFFF);
  
  char buf[64];
  snprintf(buf, sizeof(buf), "conn-%lx-%lu-%04x", 
           static_cast<unsigned long>(ms), 
           static_cast<unsigned long>(++next_id_), 
           dis(gen));
  return std::string(buf);
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
  tsfn_ready_ = true;

  closing_ = false;

  struct lws_context_creation_info cinfo;
  std::memset(&cinfo, 0, sizeof cinfo);
  cinfo.port = options_.port;
  cinfo.protocols = kServerProtocols;
  cinfo.user = this;
  cinfo.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT |
                  LWS_SERVER_OPTION_ADOPT_APPLY_LISTEN_ACCEPT_CONFIG;
  cinfo.listen_accept_role = "raw-skt";
  cinfo.listen_accept_protocol = "qwormhole-server";
  cinfo.pt_serv_buf_size = 16 * 1024;
  cinfo.vhost_name = kServerVhostName;

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
      cinfo.ssl_private_key_password = options_.tls_passphrase.c_str();
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

  UpdateListenMetadata();
  uint16_t reported_port = EffectiveListenPort();

  listening_ = true;
  service_thread_ = std::thread(&LwsServerWrapper::ServiceLoop, this);

  // Return address info
  auto deferred = Napi::Promise::Deferred::New(env);
  Napi::Object address = Napi::Object::New(env);
  address.Set("address", options_.host.empty() ? "0.0.0.0" : options_.host);
  address.Set("port", reported_port);
  address.Set("family", "IPv4");
  deferred.Resolve(address);

  EmitListening(reported_port);

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

  vhost_ = nullptr;
  listen_port_ = 0;
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

  std::vector<uint8_t> framed = BuildFramedPayload(data);

  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& [wsi, conn] : connections_) {
      conn->send_queue.push_back(framed);
      conn->queued_bytes += framed.size();

      if (!conn->backpressured &&
          conn->queued_bytes >= options_.max_backpressure_bytes) {
        conn->backpressured = true;
        EmitBackpressure(conn->id, conn->queued_bytes, options_.max_backpressure_bytes);
      }

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

  // Note: graceful_ms is accepted for API compatibility with TS server,
  // but native server currently performs immediate shutdown.
  // Graceful shutdown with connection draining is not yet implemented.
  // int graceful_ms = 1000;
  // if (info.Length() >= 1 && info[0].IsNumber()) {
  //   graceful_ms = info[0].As<Napi::Number>().Int32Value();
  // }
  (void)info; // Suppress unused parameter warning

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

Napi::Value LwsServerWrapper::CloseConnection(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "closeConnection(id) requires connection id")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string id = info[0].As<Napi::String>().Utf8Value();
  std::shared_ptr<ClientConnection> target;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = connections_by_id_.find(id);
    if (it == connections_by_id_.end()) {
      return env.Undefined();
    }
    target = it->second;
    target->closing = true;
  }

  if (target && target->wsi) {
    lws_callback_on_writable(target->wsi);
    if (context_) {
      lws_cancel_service(context_);
    }
  }

  return env.Undefined();
}

// Event emission helpers
void LwsServerWrapper::EmitListening(uint16_t port) {
  if (!tsfn_ready_) return;

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
  if (!tsfn_ready_) return;

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
      AttachHandshakeMetadataToClient(env, it->second, &conn);
      emit.Call(self, {Napi::String::New(env, "connection"), conn});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitMessage(const std::string& client_id, const std::vector<uint8_t>& data) {
  if (!tsfn_ready_) return;

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
      AttachHandshakeMetadataToClient(env, it->second, &client);
      payload.Set("client", client);
      payload.Set("data", Napi::Buffer<uint8_t>::Copy(env, data.data(), data.size()));
      emit.Call(self, {Napi::String::New(env, "message"), payload});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::EmitClientClosed(const std::string& client_id, bool had_error) {
  if (!tsfn_ready_) return;

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
  if (!tsfn_ready_) return;

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
  if (!tsfn_ready_) return;

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
  if (!tsfn_ready_) return;

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
  if (!tsfn_ready_) return;

  auto callback = [this](Napi::Env env, Napi::Function) {
    Napi::Object self = self_ref_.Value();
    if (self.Has("emit") && self.Get("emit").IsFunction()) {
      Napi::Function emit = self.Get("emit").As<Napi::Function>();
      emit.Call(self, {Napi::String::New(env, "close"), env.Undefined()});
    }
  };

  tsfn_.NonBlockingCall(callback);
}

void LwsServerWrapper::UpdateListenMetadata() {
  listen_port_ = options_.port;
  vhost_ = nullptr;
  if (!context_) {
    return;
  }

  vhost_ = lws_get_vhost_by_name(context_, kServerVhostName);
  if (!vhost_) {
    vhost_ = lws_get_vhost_by_name(context_, kDefaultVhostName);
  }

  if (!vhost_) {
    return;
  }

  int resolved = lws_get_vhost_listen_port(vhost_);
  if (resolved > 0 && resolved <= std::numeric_limits<uint16_t>::max()) {
    listen_port_ = static_cast<uint16_t>(resolved);
  }
}

uint16_t LwsServerWrapper::EffectiveListenPort() const {
  if (listen_port_ != 0) {
    return listen_port_;
  }
  return options_.port;
}

void LwsServerWrapper::TrimRxBuffer(ClientConnection* conn) {
  if (!conn) return;
  if (conn->rx_offset == 0) {
    return;
  }
  if (conn->rx_offset >= conn->rx_buffer.size()) {
    conn->rx_buffer.clear();
    conn->rx_offset = 0;
    return;
  }
  if (conn->rx_offset > conn->rx_buffer.size() / 2) {
    std::vector<uint8_t> remaining(conn->rx_buffer.begin() + conn->rx_offset,
                                   conn->rx_buffer.end());
    conn->rx_buffer.swap(remaining);
    conn->rx_offset = 0;
  }
}

bool LwsServerWrapper::HandleHandshakeFrame(
    const std::shared_ptr<ClientConnection>& conn,
    const std::vector<uint8_t>& frame) {
  if (!conn) {
    return false;
  }
  const std::string payload(frame.begin(), frame.end());
  JsonValue root;
  std::string error;
  SimpleJsonParser parser(payload);
  if (!parser.Parse(&root, &error)) {
    EmitError(std::string("Failed to parse handshake: ") + error);
    return false;
  }
  auto type = GetStringMember(root, "type");
  if (!type || *type != "handshake") {
    EmitError("Invalid handshake payload: missing type");
    return false;
  }
  if (!options_.protocol_version.empty()) {
    auto version = GetStringMember(root, "version");
    if (version && !version->empty() && *version != options_.protocol_version) {
      EmitError("Protocol version mismatch");
      return false;
    }
  }

  HandshakeMetadata metadata = BuildHandshakeMetadata(root);
  if (LooksNegantropicHandshake(root)) {
    if (!VerifyNegantropicHandshake(root, &metadata, &error)) {
      EmitError(std::string("Invalid handshake signature: ") + error);
      return false;
    }
  }

  conn->handshake_metadata = std::move(metadata);
  return true;
}

bool LwsServerWrapper::ProcessBufferedFrames(
    const std::shared_ptr<ClientConnection>& conn) {
  if (!conn) {
    return false;
  }
  while (conn->rx_buffer.size() >= conn->rx_offset + kFrameHeaderBytes) {
    const uint8_t* base = conn->rx_buffer.data() + conn->rx_offset;
    uint32_t frame_length = (static_cast<uint32_t>(base[0]) << 24) |
                            (static_cast<uint32_t>(base[1]) << 16) |
                            (static_cast<uint32_t>(base[2]) << 8) |
                            static_cast<uint32_t>(base[3]);
    if (frame_length > options_.max_frame_length) {
      EmitError("Frame length exceeded native limit");
      return false;
    }
    if (conn->rx_buffer.size() < conn->rx_offset + kFrameHeaderBytes + frame_length) {
      break;
    }
    const uint8_t* payload_begin = base + kFrameHeaderBytes;
    std::vector<uint8_t> frame(payload_begin, payload_begin + frame_length);
    conn->rx_offset += kFrameHeaderBytes + frame_length;
    TrimRxBuffer(conn.get());

    if (conn->handshake_required && !conn->handshake_complete) {
      if (!HandleHandshakeFrame(conn, frame)) {
        return false;
      }
      conn->handshake_complete = true;
      if (!conn->connection_announced) {
        conn->connection_announced = true;
        EmitConnection(conn->id);
      }
      continue;
    }

    EmitMessage(conn->id, frame);
  }
  return true;
}

bool LwsServerWrapper::ProcessIncomingData(
    const std::shared_ptr<ClientConnection>& conn,
    const uint8_t* data,
    size_t len) {
  if (!conn || !data || !len) {
    return true;
  }
  conn->rx_buffer.insert(conn->rx_buffer.end(), data, data + len);
  return ProcessBufferedFrames(conn);
}

std::vector<uint8_t> LwsServerWrapper::BuildFramedPayload(
    const std::vector<uint8_t>& data) {
  if (!options_.length_prefixed) {
    return data;
  }
  std::vector<uint8_t> framed(kFrameHeaderBytes + data.size());
  uint32_t len = static_cast<uint32_t>(data.size());
  framed[0] = static_cast<uint8_t>((len >> 24) & 0xff);
  framed[1] = static_cast<uint8_t>((len >> 16) & 0xff);
  framed[2] = static_cast<uint8_t>((len >> 8) & 0xff);
  framed[3] = static_cast<uint8_t>(len & 0xff);
  if (!data.empty()) {
    std::memcpy(framed.data() + kFrameHeaderBytes, data.data(), data.size());
  }
  return framed;
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
      char peer_ip[64] = {0};
      int peer_port = 0;
      
      // Try to get detailed peer info including port
      int fd = lws_get_socket_fd(wsi);
      if (fd >= 0) {
        struct sockaddr_storage addr;
        socklen_t addr_len = sizeof(addr);
        if (getpeername(fd, (struct sockaddr*)&addr, &addr_len) == 0) {
          if (addr.ss_family == AF_INET) {
            struct sockaddr_in* s = (struct sockaddr_in*)&addr;
            inet_ntop(AF_INET, &s->sin_addr, peer_ip, sizeof(peer_ip));
            peer_port = ntohs(s->sin_port);
          } else if (addr.ss_family == AF_INET6) {
            struct sockaddr_in6* s = (struct sockaddr_in6*)&addr;
            inet_ntop(AF_INET6, &s->sin6_addr, peer_ip, sizeof(peer_ip));
            peer_port = ntohs(s->sin6_port);
          }
        }
      }
      
      // Fallback to simple peer name if detailed info failed
      if (peer_ip[0] == '\0') {
        lws_get_peer_simple(wsi, peer_name, sizeof(peer_name));
        strncpy(peer_ip, peer_name, sizeof(peer_ip) - 1);
      }

      auto conn = std::make_shared<ClientConnection>();
      conn->id = id;
      conn->wsi = wsi;
      conn->remote_address = peer_ip;
      conn->remote_port = static_cast<uint16_t>(peer_port);
      conn->queued_bytes = 0;
      conn->backpressured = false;
      conn->closing = false;
      conn->handshake_required = !self->options_.protocol_version.empty();
      conn->handshake_complete = !conn->handshake_required;
      conn->connection_announced = !conn->handshake_required;

      {
        std::lock_guard<std::mutex> lock(self->mutex_);
        self->connections_[wsi] = conn;
        self->connections_by_id_[id] = conn;
      }

      if (!conn->handshake_required) {
        self->EmitConnection(id);
      }
      break;
    }

    case LWS_CALLBACK_RAW_RX: {
      if (!in || len == 0) {
        break;
      }
      std::shared_ptr<ClientConnection> conn;
      {
        std::lock_guard<std::mutex> lock(self->mutex_);
        auto it = self->connections_.find(wsi);
        if (it != self->connections_.end()) {
          conn = it->second;
        }
      }
      if (!conn) {
        break;
      }
      if (conn->closing) {
        return -1;
      }
      if (!self->options_.length_prefixed) {
        std::vector<uint8_t> data(static_cast<uint8_t*>(in),
                                  static_cast<uint8_t*>(in) + len);
        self->EmitMessage(conn->id, data);
        break;
      }
      if (!self->ProcessIncomingData(conn, static_cast<uint8_t*>(in), len)) {
        return -1;
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

      if (!conn) {
        break;
      }
      if (conn->closing) {
        return -1;
      }

      if (!conn->send_queue.empty()) {
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
