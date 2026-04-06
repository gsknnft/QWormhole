const { spawnSync } = require("node:child_process");
const path = require("node:path");

const structureLane = process.argv.includes("--structure");
const multiClientLane = process.argv.includes("--multi");
const highConcurrencyLane = process.argv.includes("--high-concurrency");
const secureTransport = process.env.QWORMHOLE_BENCH_SECURE_TRANSPORT === "1";

const laneSuffix = highConcurrencyLane
  ? ".highconcurrency"
  : multiClientLane
    ? ".multi"
    : "";

const env = {
  ...process.env,
  QWORMHOLE_BENCH_SECURE_TRANSPORT: secureTransport ? "1" : "0",
  QWORMHOLE_BENCH_REPORT:
    process.env.QWORMHOLE_BENCH_REPORT ||
    (structureLane
      ? `data/core_diagnostics${laneSuffix}.structure.md`
      : `data/core_diagnostics${laneSuffix}.md`),
  QWORMHOLE_BENCH_JSONL:
    process.env.QWORMHOLE_BENCH_JSONL ||
    (structureLane
      ? `data/core_diagnostics${laneSuffix}.structure.jsonl`
      : `data/core_diagnostics${laneSuffix}.jsonl`),
  QWORMHOLE_BENCH_CLIENTS:
    process.env.QWORMHOLE_BENCH_CLIENTS ||
    (highConcurrencyLane ? "64" : multiClientLane ? "16" : "1"),
  QWORMHOLE_BENCH_MESSAGES:
    process.env.QWORMHOLE_BENCH_MESSAGES ||
    (highConcurrencyLane ? "320000" : multiClientLane ? "160000" : "100000"),
  QWORMHOLE_BENCH_WARMUP_MESSAGES:
    process.env.QWORMHOLE_BENCH_WARMUP_MESSAGES ||
    (highConcurrencyLane ? "16000" : multiClientLane ? "8000" : "5000"),
};
delete env.QWORMHOLE_FORCE_SLICE;
delete env.QWORMHOLE_BENCH_LANE;
if (structureLane) {
  env.QWORMHOLE_TRANSPORT_COHERENCE =
    process.env.QWORMHOLE_TRANSPORT_COHERENCE || "1";
} else {
  delete env.QWORMHOLE_TRANSPORT_COHERENCE;
}
if (!secureTransport) {
  delete env.QWORMHOLE_TLS_ENABLED;
  delete env.QWORMHOLE_TLS_CERT;
  delete env.QWORMHOLE_TLS_CERT_PATH;
  delete env.QWORMHOLE_TLS_KEY;
  delete env.QWORMHOLE_TLS_KEY_PATH;
  delete env.QWORMHOLE_TLS_CA;
  delete env.QWORMHOLE_TLS_CA_PATH;
  delete env.QWORMHOLE_TLS_CA_PATHS;
  delete env.QWORMHOLE_TLS_REJECT_UNAUTHORIZED;
  delete env.QWORMHOLE_TLS_REQUEST_CERT;
  delete env.QWORMHOLE_TLS_SERVERNAME;
  delete env.QWORMHOLE_TLS_ALPN;
  delete env.QWORMHOLE_TLS_CLIENT_CERT;
  delete env.QWORMHOLE_TLS_CLIENT_CERT_PATH;
  delete env.QWORMHOLE_TLS_CLIENT_KEY;
  delete env.QWORMHOLE_TLS_CLIENT_KEY_PATH;
  delete env.QWORMHOLE_TLS_CLIENT_PASSPHRASE;
  delete env.QWORMHOLE_REQUIRE_HANDSHAKE;
  delete env.QWORMHOLE_HANDSHAKE_REQUIRED_TAGS;
  delete env.QWORMHOLE_HANDSHAKE_ALLOWED_VERSIONS;
  delete env.QWORMHOLE_PROTOCOL_VERSION;
}

const command =
  process.platform === "win32"
    ? ["cmd.exe", ["/c", "tsx", "scripts/bench.ts", "--mode=core", "--diagnostics"]]
    : ["tsx", ["scripts/bench.ts", "--mode=core", "--diagnostics"]];

const result = spawnSync(command[0], command[1], {
  stdio: "inherit",
  env,
});

if ((result.status ?? 1) === 0) {
  const rawJsonl = path.join(__dirname, "..", `data/core_diagnostics${laneSuffix}.jsonl`);
  const structureJsonl = path.join(
    __dirname,
    "..",
    `data/core_diagnostics${laneSuffix}.structure.jsonl`,
  );
  const deltaOut = path.join(
    __dirname,
    "..",
    `data/core_diagnostics${laneSuffix}.delta.md`,
  );
  spawnSync(
    process.execPath,
    [
      path.join(__dirname, "generate-bench-delta-report.js"),
      "--raw",
      rawJsonl,
      "--structure",
      structureJsonl,
      "--out",
      deltaOut,
      "--title",
      "QWormhole Core Bench Delta Report",
    ],
    { stdio: "inherit", env },
  );
}

process.exit(result.status ?? 1);
