#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cwd = process.cwd();
const platformArch = `${os.platform()}-${os.arch()}`;
const prebuildDir = path.join(cwd, "prebuilds", platformArch);
const releaseDir = path.join(cwd, "build", "Release");
const distNativeDir = path.join(cwd, "dist", "native");

const artifacts = ["qwormhole_lws.node", "qwormhole.node"];

if (!fs.existsSync(prebuildDir)) {
  fs.mkdirSync(prebuildDir, { recursive: true });
}

let copied = 0;
for (const file of artifacts) {
  const releaseSrc = path.join(releaseDir, file);
  const distSrc = path.join(distNativeDir, file);
  const src = fs.existsSync(releaseSrc)
    ? releaseSrc
    : fs.existsSync(distSrc)
      ? distSrc
      : null;
  if (!src) continue;
  const dst = path.join(prebuildDir, file);
  fs.copyFileSync(src, dst);
  copied += 1;
  console.log(`[qwormhole] staged prebuilt ${src} -> ${dst}`);
}

if (!copied) {
  console.warn(
    "[qwormhole] no native artifacts found in build/Release or dist/native; nothing staged",
  );
  process.exit(1);
}

console.log(
  `[qwormhole] prebuilt staging complete (${copied} artifact(s)) for ${platformArch}`,
);
