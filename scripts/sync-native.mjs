import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const source = path.join(rootDir, "build", "Release", "bigint_buffer.node");
const distTarget = path.join(rootDir, "dist", "build", "Release", "bigint_buffer.node");

const extraTargets = [
  path.join(rootDir, "src", "conversion", "build", "Release", "bigint_buffer.node"),
  path.join(rootDir, "src", "conversion", "dist", "build", "Release", "bigint_buffer.node"),
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function removeDistArtifacts() {
  const distBuildDir = path.dirname(distTarget);
  await fs.rm(distBuildDir, { recursive: true, force: true });
}

async function copyNative() {
  if (!(await fileExists(source))) {
    throw new Error(`sync-native: source native binary not found at ${source}`);
  }

  await removeDistArtifacts();
  await ensureDirectory(distTarget);
  await fs.copyFile(source, distTarget);

  for (const target of extraTargets) {
    await ensureDirectory(target);
    await fs.copyFile(source, target);
  }
}

copyNative().catch((error) => {
  console.error("Failed to synchronize native binaries:", error);
  process.exitCode = 1;
});
