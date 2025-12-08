#!/usr/bin/env node
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.resolve(rootDir, "src", "conversion", "dist");
const targetDir = path.resolve(rootDir, "dist", "conversion");

async function ensureSource() {
  try {
    const info = await stat(sourceDir);
    if (!info.isDirectory()) {
      throw new Error("source is not a directory");
    }
  } catch (error) {
    throw new Error(`Expected built conversion output at ${sourceDir}, run the conversion build first.`);
  }
}

async function syncConversion() {
  await ensureSource();
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
}

syncConversion().catch((error) => {
  console.error("Failed to sync conversion artifacts:", error);
  process.exitCode = 1;
});
