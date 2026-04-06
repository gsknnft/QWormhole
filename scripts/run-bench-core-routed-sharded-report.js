const { spawnSync } = require("node:child_process");
const path = require("node:path");

const env = {
  ...process.env,
  QWORMHOLE_BENCH_REPORT:
    process.env.QWORMHOLE_BENCH_REPORT ??
    "data/routed_sharded_core_diagnostics.md",
  QWORMHOLE_BENCH_JSONL:
    process.env.QWORMHOLE_BENCH_JSONL ??
    "data/routed_sharded_core_diagnostics.jsonl",
  QWORMHOLE_BENCH_MESSAGES:
    process.env.QWORMHOLE_BENCH_MESSAGES ?? "160000",
  QWORMHOLE_BENCH_CLIENTS:
    process.env.QWORMHOLE_BENCH_CLIENTS ?? "16",
  QWORMHOLE_BENCH_WARMUP_MESSAGES:
    process.env.QWORMHOLE_BENCH_WARMUP_MESSAGES ?? "8000",
  QWORMHOLE_BENCH_SHARD_WORKERS:
    process.env.QWORMHOLE_BENCH_SHARD_WORKERS ?? "4",
};

const result =
  process.platform === "win32"
    ? spawnSync(
        "cmd.exe",
        [
          "/c",
          path.join("node_modules", ".bin", "tsx.cmd"),
          path.join("scripts", "bench-routed-sharded.ts"),
        ],
        {
          stdio: "inherit",
          env,
        },
      )
    : spawnSync("node_modules/.bin/tsx", ["scripts/bench-routed-sharded.ts"], {
        stdio: "inherit",
        env,
      });

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
