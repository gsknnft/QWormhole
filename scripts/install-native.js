#!/usr/bin/env node
/* eslint-disable no-console */
import { spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const platform = os.platform();
const forceNative = process.env.QWORMHOLE_NATIVE === "1";
const forceRebuild =
  process.env.QWORMHOLE_NATIVE_FORCE_REBUILD === "1" ||
  process.env.QWORMHOLE_FORCE_REBUILD === "1";
const explicitSkip = process.env.QWORMHOLE_NATIVE === "0";
const macOsAutoSkip = platform === "darwin" && !forceNative;
const skipNative = explicitSkip || macOsAutoSkip;
const require = createRequire(import.meta.url);

const resolveNodeGypCommand = () => {
  try {
    const script = require.resolve("node-gyp/bin/node-gyp.js");
    return {
      command: process.execPath,
      argsPrefix: [script],
    };
  } catch {
    return {
      command: process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
      argsPrefix: [],
    };
  }
};

const nodeGyp = resolveNodeGypCommand();

const hasNodeGyp = () => {
  const check = spawnSync(nodeGyp.command, [...nodeGyp.argsPrefix, "--version"], {
    stdio: "ignore",
  });
  return check.status === 0;
};
const skipLibsocket =
  process.env.QWORMHOLE_BUILD_LIBSOCKET === "0" ||
  platform === "win32" ||
  platform === "darwin"; // libsocket relies on Linux-only APIs
  

const artifacts = [
  path.join(process.cwd(), "dist", "native", "qwormhole_lws.node"),
  path.join(process.cwd(), "dist", "native", "qwormhole.node"),
];

const hydrateFromPrebuilds = () => {
  const platformArch = `${platform}-${os.arch()}`;
  const candidates = [
    path.join(process.cwd(), "prebuilds", platformArch),
    path.join(process.cwd(), "dist", "native", "prebuilds", platformArch),
  ];
  const names = ["qwormhole_lws.node", "qwormhole.node"];
  const outDir = path.join(process.cwd(), "dist", "native");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let copied = 0;
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    for (const name of names) {
      const src = path.join(dir, name);
      const dst = path.join(outDir, name);
      if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
      fs.copyFileSync(src, dst);
      copied += 1;
      console.log(`[qwormhole] hydrated prebuilt ${src} -> ${dst}`);
    }
  }
  return copied;
};

const prebuiltHydrated = hydrateFromPrebuilds();
if (prebuiltHydrated > 0 && !forceRebuild) {
  console.log("[qwormhole] native prebuild available; skipping rebuild.");
  process.exit(0);
}

const alreadyBuilt = artifacts.some(p => fs.existsSync(p));

if (skipNative) {
  if (macOsAutoSkip) {
    console.log(
      "[qwormhole] Native build skipped on macOS (libsocket backend requires Linux). Set QWORMHOLE_NATIVE=1 to force an attempted build.",
    );
  } else {
    console.log(
      "[qwormhole] Native build skipped via QWORMHOLE_NATIVE=0 (TS transport remains available).",
    );
  }
  process.exit(0);
}

if (alreadyBuilt && !forceRebuild) {
  console.log("[qwormhole] Native artifact already present; skipping rebuild.");
  process.exit(0);
}

if (forceRebuild) {
  console.log("[qwormhole] Forcing native rebuild.");
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

const result = spawnSync(nodeGyp.command, [...nodeGyp.argsPrefix, "rebuild"], {
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
