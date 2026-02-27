const { spawnSync } = require("node:child_process");

const structureLane = process.argv.includes("--structure");

const env = {
  ...process.env,
  QWORMHOLE_BENCH_REPORT:
    process.env.QWORMHOLE_BENCH_REPORT ||
    (structureLane
      ? "data/compare_diagnostics.structure.md"
      : "data/compare_diagnostics.md"),
  QWORMHOLE_BENCH_JSONL:
    process.env.QWORMHOLE_BENCH_JSONL ||
    (structureLane
      ? "data/compare_diagnostics.structure.jsonl"
      : "data/compare_diagnostics.jsonl"),
  QWORMHOLE_BENCH_MESSAGES:
    process.env.QWORMHOLE_BENCH_MESSAGES || "100000",
  QWORMHOLE_BENCH_WARMUP_MESSAGES:
    process.env.QWORMHOLE_BENCH_WARMUP_MESSAGES || "5000",
};

delete env.QWORMHOLE_FORCE_SLICE;
delete env.QWORMHOLE_BENCH_LANE;

if (structureLane) {
  env.QWORMHOLE_TRANSPORT_COHERENCE =
    process.env.QWORMHOLE_TRANSPORT_COHERENCE || "1";
} else {
  delete env.QWORMHOLE_TRANSPORT_COHERENCE;
}

const command =
  process.platform === "win32"
    ? ["cmd.exe", ["/c", "tsx", "scripts/bench.ts", "--mode=compare", "--diagnostics"]]
    : ["tsx", ["scripts/bench.ts", "--mode=compare", "--diagnostics"]];

const result = spawnSync(command[0], command[1], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
