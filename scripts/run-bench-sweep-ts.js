/**
 * Simple sweep runner for TS bench (rate + cap + optional flush interval).
 *
 * Usage:
 *   node scripts/run-bench-sweep-ts.js
 *   RATES_MB=16,32,64 CAPS_KB=96,256,512,1024 FLUSH_MS=1,2 node scripts/run-bench-sweep-ts.js
 */

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const command = process.platform === "win32" ? "cmd" : "pnpm";

const parseList = (value, fallback) =>
  value
    ? value
        .split(",")
        .map(v => Number(v.trim()))
        .filter(Number.isFinite)
    : fallback;

const ratesMb = parseList(process.env.RATES_MB, [16, 32, 64]);
const capsKb = parseList(process.env.CAPS_KB, [96, 256, 512, 1024]);
const flushMsList = parseList(process.env.FLUSH_MS, [1]);
const capBuffers = Number(process.env.CAPS_BUFFERS || "64") || 64;
const diversity = process.env.DIVERSITY === "1" || process.env.DIVERSITY === "true";
const jsonlPath =
  process.env.JSONL ||
  path.join("data", `bench-ts-sweep-${Date.now()}.jsonl`);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const run = (rateBytes, capBytes, flushMs) =>
  new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      QWORMHOLE_FORCE_RATE_BYTES: String(rateBytes),
      QWORMHOLE_TS_FRAMER_MAX_BYTES: String(capBytes),
      QWORMHOLE_TS_FRAMER_MAX_BUFFERS: String(capBuffers),
      QWORMHOLE_TS_FLUSH_INTERVAL_MS: String(flushMs),
      QWORMHOLE_BENCH_DIAGNOSTICS: "1",
      QWORMHOLE_BENCH_JSONL: jsonlPath,
    };
    if (diversity) env.QWORMHOLE_BENCH_DIVERSITY = "1";

    const args = [
      "run",
      "bench",
      "--",
      "--mode=ts",
      "--diagnostics",
    ];

    const spawnArgs =
      process.platform === "win32" ? ["/c", "pnpm", ...args] : args;

    const proc = spawn(command, spawnArgs, {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env,
    });

    proc.on("error", reject);
    proc.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm exited with code ${code}`));
    });
  });

(async () => {
  for (const flushMs of flushMsList) {
    for (const capKb of capsKb) {
      for (const rateMb of ratesMb) {
        const rateBytes = Math.round(rateMb * 1024 * 1024);
        const capBytes = Math.round(capKb * 1024);
        console.log(
          `\n=== sweep: rate=${rateMb}MB/s cap=${capKb}KB flushMs=${flushMs} ===`,
        );
        await run(rateBytes, capBytes, flushMs);
      }
    }
  }
  console.log(`\nSweep complete. JSONL appended to ${jsonlPath}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
