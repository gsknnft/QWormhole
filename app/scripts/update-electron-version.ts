import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from 'path';
import chalk from 'chalk';

// Use fs-extra if available, fallback to node:fs
let fs: any;
try {
  fs = require('fs-extra');
} catch {
  fs = require('node:fs');
}


const appRoot = path.resolve(__dirname, "../");

// Find node_modules - start from local and search upward, but limit search
let projectRoot = path.resolve(__dirname, '../');
let searchDepth = 0;
const maxSearchDepth = 5; // Limit upward search to prevent going too far

while (projectRoot !== path.parse(projectRoot).root && searchDepth < maxSearchDepth) {
  const nm = path.join(projectRoot, 'node_modules');
  if (fs.existsSync(nm)) {
    projectRoot = nm;
    break;
  }
  projectRoot = path.dirname(projectRoot);
  searchDepth++;
}

// If we didn't find node_modules, use the app root's node_modules
if (!fs.existsSync(projectRoot) || searchDepth >= maxSearchDepth) {
  projectRoot = path.join(appRoot, 'node_modules');
  if (!fs.existsSync(projectRoot)) {
    console.log(chalk.yellowBright('No node_modules found — skipping Electron version check.'));
    process.exit(0);
  }
}

console.log(`📦 Using node_modules at: ${projectRoot}`);

// const rootPkgPath = path.join(projectRoot, "package.json");
const appPkgPath = path.join(appRoot, "package.json");
const cacheFile = path.join(appRoot, ".electron-version");

const FORCE_UPDATE = process.argv.includes("--update-electron");
const AUTO_INSTALL = process.argv.includes("--yes");

// ---- Cache helpers ----

function getCachedVersion(): string | null {
  if (!existsSync(cacheFile)) return null;
  const age = Date.now() - statSync(cacheFile).mtimeMs;
  const oneDay = 1000 * 60 * 60 * 24;
  if (age > oneDay && !FORCE_UPDATE) {
    console.log("⚠️ Electron version cache older than 24h. Use --update-electron to refresh.");
  }
  return readFileSync(cacheFile, "utf8").trim();
}

function cacheVersion(version: string) {
  writeFileSync(cacheFile, version);
  console.log(`💾 Cached Electron version: ${version}`);
}

// ---- Fetch latest version safely ----

async function getLatestElectronVersion(): Promise<string> {
  console.log("🔍 Fetching latest Electron version from npm (isolated mode)...");
  try {
    // Completely isolated npm command — skips all workspace logic
    const version = execSync("npm view electron version --no-workspaces --ignore-scripts", {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();
    if (version && /^\d+\./.test(version)) return version;
  } catch {
    console.warn("⚠️ npm CLI lookup failed, falling back to HTTPS registry…");
  }

  // Fallback: direct registry fetch
  const https = await import("node:https");
  return new Promise((resolve, reject) => {
    https
      .get("https://registry.npmjs.org/electron/latest", (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.version) resolve(parsed.version);
            else reject(new Error("Version not found in response"));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

// ---- Write updated versions ----

function updatePackageJson(filePath: string, version: string) {
  const pkg = JSON.parse(readFileSync(filePath, "utf8"));
  pkg.devDependencies = pkg.devDependencies || {};
  pkg.devDependencies.electron = version;

  pkg.build = pkg.build || {};
  pkg.build.electronVersion = version;

  writeFileSync(filePath, JSON.stringify(pkg, null, 2));
  console.log(`✅ Updated ${path.relative(appRoot, filePath)} → Electron ${version}`);
}

// ---- Install if requested ----

function installElectron(version: string) {
  console.log(`📦 Installing Electron ${version} (isolated, no workspaces)…`);
  try {
    execSync(`pnpm install -D electron@${version} --ignore-scripts --no-workspaces`, {
      cwd: appRoot,
      stdio: "inherit",
    });
    console.log(`✅ Electron ${version} installed successfully.`);
  } catch (err) {
    console.error("⚠️ Failed to install Electron:", err);
  }
}

// ---- Main runner ----

(async () => {
  try {
    let version = getCachedVersion();

    if (!version || FORCE_UPDATE) {
      version = await getLatestElectronVersion();
      cacheVersion(version);
    } else {
      console.log(`⚙️ Using cached Electron version: ${version}`);
    }

    updatePackageJson(appPkgPath, version);

    if (AUTO_INSTALL) {
      installElectron(version);
    } else {
      console.log(`💡 Skipping auto-install. Run manually if needed: pnpm add -D electron@${version}`);
    }
  } catch (err) {
    console.error("❌ Failed to update Electron version:", err);
    process.exit(1);
  }
})();
