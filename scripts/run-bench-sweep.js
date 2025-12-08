/**
 * Simple sweep runner for bench-writev.
 *
 * Usage:
 *   node scripts/run-bench-sweep.js
 *   BATCHES=8,16,32 FLUSHES=0,1 node scripts/run-bench-sweep.js
 *
 * Outputs CSVs to ./data (relative to this package).
 */

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require('child_process');
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");

const parseList = (value, fallback) =>
  value ? value.split(",").map(v => Number(v.trim())).filter(Number.isFinite) : fallback;

const batches = parseList(process.env.BATCHES, [8, 16, 32, 64]);
const flushes = parseList(process.env.FLUSHES, [1]);
const frames = Number(process.env.FRAMES || "10000");
const payload = Number(process.env.PAYLOAD || "1024");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const run = (batch, flushMs) =>
  new Promise((resolve, reject) => {
    const csvName = `b${batch}-f${flushMs}.csv`;
    const csvPath = path.join("data", csvName);
    const args = [
      "--filter",
      "@gsknnft/qwormhole",
      "bench:writev",
      `--batch=${batch}`,
      `--flushMs=${flushMs}`,
      `--frames=${frames}`,
      `--payload=${payload}`,
      `--csv=${csvPath}`,
    ];

    const proc = spawn("pnpm", args, {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });

    proc.on("error", reject);
    proc.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm exited with code ${code}`));
    });
  });

(async () => {
  for (const flushMs of flushes) {
    for (const batch of batches) {
      console.log(`\n=== sweep: batch=${batch}, flushMs=${flushMs} ===`);
      await run(batch, flushMs);
    }
  }
  console.log("\nSweep complete. CSVs are under ./data");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
