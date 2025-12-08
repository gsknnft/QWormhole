import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pkg from "../package.json";

const electronDir = path.resolve(__dirname, "../app");

if (!fs.existsSync(electronDir)) {
  console.log("ℹ️ Electron app directory not found, skipping rebuild.");
  process.exit(0);
}

if (process.env.ELECTRON_REBUILD_RUNNING === "1") {
  console.log("⚠️ Skipping recursive electron-rebuild (already running)");
  process.exit(0);
}

process.env.ELECTRON_REBUILD_RUNNING = "1";

// 🧩 Define modules that shouldn't rebuild on Windows
const skipModules = [
  "inotify",         // Linux only
  "fsevents",        // macOS only
];

const skipArgs =
  process.platform === "win32"
    ? skipModules.map((m) => `--only ${m}=false`).join(" ")
    : "";

try {
  console.log("🔧 Rebuilding native modules for Electron (pnpm-isolated)...");
  execSync(
    `pnpm --filter ${pkg.name} exec electron-update --module-dir . --force --types prod,dev,optional ${skipArgs}`,
    {
      cwd: electronDir,
      stdio: "inherit",
      env: { ...process.env, ELECTRON_REBUILD_RUNNING: "1" },
    }
  );
  console.log("✅ Electron rebuild complete.");
} catch (err) {
  console.error("❌ Electron rebuild failed:", err);
  process.exit(1);
}
