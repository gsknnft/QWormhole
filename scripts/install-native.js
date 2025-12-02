#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const skipNative = process.env.QWORMHOLE_NATIVE === "0";
const nodeGypCmd = process.platform === "win32" ? "node-gyp.cmd" : "node-gyp";

const hasNodeGyp = () => {
  const check = spawnSync(nodeGypCmd, ["--version"], { stdio: "ignore" });
  return check.status === 0;
};
const skipLibsocket =
  process.env.QWORMHOLE_BUILD_LIBSOCKET === "0" ||
  os.platform() === "win32"; // libsocket is POSIX-only

const artifacts = [
  path.join(process.cwd(), "dist", "native", "qwormhole_lws.node"),
  path.join(process.cwd(), "dist", "native", "qwormhole.node"),
];

const alreadyBuilt = artifacts.some(p => fs.existsSync(p));

if (skipNative) {
  console.log(
    "[qwormhole] Native build skipped via QWORMHOLE_NATIVE=0 (TS transport remains available).",
  );
  process.exit(0);
}

if (alreadyBuilt) {
  console.log("[qwormhole] Native artifact already present; skipping rebuild.");
  process.exit(0);
}

if (!hasNodeGyp()) {
  console.warn(
    "[qwormhole] node-gyp not found; skipping native build (TS transport remains available). Install node-gyp to enable native bindings.",
  );
  process.exit(0);
}

console.log(
  "[qwormhole] Attempting native build via node-gyp (TS transport remains available as fallback)...",
);
const env = {
  ...process.env,
  QWORMHOLE_BUILD_LIBSOCKET: skipLibsocket ? "0" : "1",
};

// WSL sometimes points TMP/TEMP at a Windows mount that lacks write perms for make.
const tmpVars = [env.TMPDIR, env.TMP, env.TEMP];
const needsTmpFix =
  os.platform() !== "win32" &&
  tmpVars.some(val => typeof val === "string" && val.startsWith("/mnt/"));
if (needsTmpFix) {
  env.TMPDIR = env.TMP = env.TEMP = "/tmp";
  console.log("[qwormhole] Using TMPDIR=/tmp to avoid cross-mount temp permission issues.");
}

const ensureLibsocketConf = () => {
  const src = path.join(process.cwd(), "libsocket", "headers", "conf.h");
  const dstDir = path.join(process.cwd(), "libsocket", "C", "inet");
  const dst = path.join(dstDir, "conf.h");
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, dst);
};

ensureLibsocketConf();

const result = spawnSync(nodeGypCmd, ["rebuild"], {
  stdio: "inherit",
  env,
});

if (result.status !== 0) {
  const detail =
    result.status === null && result.error
      ? ` (spawn error: ${result.error.message})`
      : "";
  console.warn(
    `[qwormhole] Native build failed (status ${result.status}${detail}). Continuing with TS transport fallback.`,
  );
  process.exit(0);
}

console.log("[qwormhole] Native build succeeded.");
process.exit(0);
