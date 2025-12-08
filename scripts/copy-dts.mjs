import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const typesDir = path.resolve(rootDir, "dist", "types");

const targets = [
  {
    source: path.join(typesDir, "index.d.ts"),
    destination: path.join(rootDir, "dist", "index.d.ts"),
  },
  {
    source: path.join(typesDir, "conversion", "index.d.ts"),
    destination: path.join(rootDir, "dist", "conversion", "index.d.ts"),
  },
];

async function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function copyFiles() {
  for (const { source, destination } of targets) {
    await ensureDirectory(destination);
    await fs.copyFile(source, destination);
  }
}

copyFiles().catch((error) => {
  console.error("Failed to copy declaration files:", error);
  process.exitCode = 1;
});
