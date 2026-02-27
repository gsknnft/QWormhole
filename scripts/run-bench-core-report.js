const { spawnSync } = require("node:child_process");

const env = {
  ...process.env,
  QWORMHOLE_BENCH_REPORT:
    process.env.QWORMHOLE_BENCH_REPORT || "data/core_diagnostics.md",
  QWORMHOLE_BENCH_JSONL:
    process.env.QWORMHOLE_BENCH_JSONL || "data/core_diagnostics.jsonl",
  QWORMHOLE_BENCH_MESSAGES:
    process.env.QWORMHOLE_BENCH_MESSAGES || "100000",
  QWORMHOLE_BENCH_WARMUP_MESSAGES:
    process.env.QWORMHOLE_BENCH_WARMUP_MESSAGES || "5000",
};
delete env.QWORMHOLE_FORCE_SLICE;
delete env.QWORMHOLE_BENCH_LANE;

const command =
  process.platform === "win32"
    ? ["cmd.exe", ["/c", "tsx", "scripts/bench.ts", "--mode=core", "--diagnostics"]]
    : ["tsx", ["scripts/bench.ts", "--mode=core", "--diagnostics"]];

const result = spawnSync(command[0], command[1], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
