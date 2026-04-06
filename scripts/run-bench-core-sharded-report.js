const { spawnSync } = require("node:child_process");

const env = {
  ...process.env,
  QWORMHOLE_BENCH_REPORT:
    process.env.QWORMHOLE_BENCH_REPORT || "data/sharded_core_diagnostics.md",
  QWORMHOLE_BENCH_JSONL:
    process.env.QWORMHOLE_BENCH_JSONL ||
    "data/sharded_core_diagnostics.jsonl",
  QWORMHOLE_BENCH_MESSAGES:
    process.env.QWORMHOLE_BENCH_MESSAGES || "160000",
  QWORMHOLE_BENCH_CLIENTS:
    process.env.QWORMHOLE_BENCH_CLIENTS || "16",
  QWORMHOLE_BENCH_WARMUP_MESSAGES:
    process.env.QWORMHOLE_BENCH_WARMUP_MESSAGES || "8000",
  QWORMHOLE_BENCH_SHARD_WORKERS:
    process.env.QWORMHOLE_BENCH_SHARD_WORKERS || "4",
  QWORMHOLE_BENCH_SHARD_PORT:
    process.env.QWORMHOLE_BENCH_SHARD_PORT || "0",
};

const command =
  process.platform === "win32"
    ? ["cmd.exe", ["/c", "tsx", "scripts/bench-sharded.ts"]]
    : ["tsx", ["scripts/bench-sharded.ts"]];

const result = spawnSync(command[0], command[1], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
