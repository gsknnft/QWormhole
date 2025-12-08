// .erb/scripts/check-native-dep.ts
import path from 'path';
import chalk from 'chalk';
// import { execSync } from 'child_process';

// Use fs-extra if available, fallback to node:fs
let fs: any;
try {
  fs = require('fs-extra');
} catch {
  fs = require('node:fs');
}

const rootDir = process.cwd();
const localRoot = path.resolve(__dirname, '../');

// Find node_modules - start from local and search upward with limit
let rootModulesPath = localRoot;
let searchDepth = 0;
const maxSearchDepth = 5;

while (rootModulesPath !== path.parse(rootModulesPath).root && searchDepth < maxSearchDepth) {
  const nm = path.join(rootModulesPath, 'node_modules');
  if (fs.existsSync(nm)) {
    rootModulesPath = nm;
    break;
  }
  rootModulesPath = path.dirname(rootModulesPath);
  searchDepth++;
}

// If we didn't find node_modules, try local
if (!fs.existsSync(rootModulesPath) || searchDepth >= maxSearchDepth) {
  rootModulesPath = path.join(localRoot, 'node_modules');
  if (!fs.existsSync(rootModulesPath)) {
    console.log(chalk.yellowBright('No node_modules found — skipping native dependency check.'));
    process.exit(0);
  }
}

console.log(`📦 Using node_modules at: ${rootModulesPath}`);

// Read dependencies from package.json - try multiple locations
let pkgJsonPath = path.resolve(rootDir, 'package.json');
if (!fs.existsSync(pkgJsonPath)) {
  pkgJsonPath = path.resolve(localRoot, 'package.json');
}

const pkgJson = fs.existsSync(pkgJsonPath)
  ? JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  : {};
const dependencies = pkgJson.dependencies || {};

// detect native deps (modules containing binding.gyp or .node binaries)
const nativeDeps: string[] = [];
for (const folder of fs.readdirSync(rootModulesPath)) {
  const full = path.join(rootModulesPath, folder);
  try {
    if (
      fs.existsSync(path.join(full, 'binding.gyp')) ||
      fs.readdirSync(full).some((f: string) => f.endsWith('.node'))
    ) {
      nativeDeps.push(folder);
    }
  } catch {
    // ignore broken or linked modules
  }
}

if (nativeDeps.length === 0) {
  console.log(chalk.green('✅ No native deps found.'));
  process.exit(0);
}

// check if any native deps are declared at root level (should be in release/app)
const offending = nativeDeps.filter((dep) =>
  Object.prototype.hasOwnProperty.call(dependencies, dep)
);

if (offending.length > 0) {
  const plural = offending.length > 1;
  console.log(`
${chalk.whiteBright.bgRed.bold('Native deps detected!')}
${chalk.bold(offending.join(', '))} ${plural ? 'are' : 'is'} native and should live in ./release/app
  `.trim());
  process.exit(1);
}

console.log(chalk.gray('ℹ️ Native dependency check completed — no issues found.'));
