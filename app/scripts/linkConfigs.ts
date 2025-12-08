// import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from 'yaml'
import crypto from "node:crypto";
import paths from "./paths";
import { cleanVersion } from "./version-utils";


interface WorkspaceConfig {
  version: string
  enabled: boolean
  link: Record<string, boolean>
  baseVersion?: string
  lastSynced?: string
}
//add any excludions here
const exclusion = process.env.EXCLUSIONS ?? ['',''];
const { appNodeModulesPath, workspaceConfigPath } = paths;

const yamlPath = workspaceConfigPath.replace(/\.json$/, ".yaml");
const rootFallbackYaml = path.resolve(__dirname, "../configs/default.root.yaml");
const rootCopyYaml = path.resolve(__dirname, "../configs/root.workspaces.base.yaml");

// 🧹 PRE-LINK SAFETY: detect and remove circular or self-referential symlinks
export function scanAndFixCircularSymlinks(baseDir: string) {
  console.log(`🧹 Scanning for circular symlinks under ${baseDir} ...`);

  const visited = new Set<string>();
  const circularLinks: string[] = [];

  function walk(dir: string) {
    if (visited.has(dir)) return;
    visited.add(dir);

    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);

      let stat;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        let target: string | undefined;
        try {
          target = fs.readlinkSync(fullPath);
        } catch {
          continue;
        }

        const resolvedTarget = path.resolve(path.dirname(fullPath), target);
        const resolvedSelf = path.resolve(fullPath);

        if (
          resolvedTarget === resolvedSelf ||
          resolvedTarget.startsWith(resolvedSelf)
        ) {
          circularLinks.push(fullPath);
          console.warn(`⚠️ Circular/self link detected: ${fullPath} -> ${resolvedTarget}`);
          try {
            fs.unlinkSync(fullPath);
            console.log(`🔥 Removed bad symlink: ${fullPath}`);
          } catch (e) {
            console.error(`❌ Failed to remove ${fullPath}:`, e);
          }
          continue;
        }
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(baseDir);

  if (circularLinks.length === 0) {
    console.log("✅ No circular symlinks found.");
  } else {
    console.log(`🧨 Removed ${circularLinks.length} circular symlinks total.`);
  }
}


// 🧭 Locate monorepo root
function findWorkspaceRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const workspaceFile = path.join(current, "pnpm-workspace.yaml");
    const packageJson = path.join(current, "package.json");

    if (fs.existsSync(workspaceFile)) {
      const data = { workspaceRoot: current, detectedAt: new Date().toISOString() };
      fs.writeFileSync(rootCopyYaml, stringify(data));
      console.log(`📦 Workspace root recorded → ${rootCopyYaml}`);
      return current;
    }

    if (fs.existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
        if (pkg.workspaces) return current;
      } catch {}
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // No workspace root found - treat as standalone project
  console.log("ℹ️ No workspace root found - treating as standalone project");
  return null;
}

const workspaceRoot = findWorkspaceRoot(__dirname);

// 🧩 Hash utility for config version
function hashConfig(content: string) {
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 8);
}

// 🧩 Load root YAML config
function loadRootConfig(): WorkspaceConfig {
  if (!fs.existsSync(rootFallbackYaml)) {
    const defaultRoot: WorkspaceConfig = { version: "1.0.0", enabled: true, link: {} }
    fs.writeFileSync(rootFallbackYaml, stringify(defaultRoot))
    return defaultRoot
  }
  const content = fs.readFileSync(rootFallbackYaml, 'utf8')
  const parsed = parse(content) as WorkspaceConfig
  if (!parsed.version) {
    parsed.version = `1.0.0-${hashConfig(JSON.stringify(parsed))}`
    fs.writeFileSync(rootFallbackYaml, stringify(parsed))
  }
  return parsed
}


// 🧩 Versioned sync helper
function syncWorkspaceConfig(rootConfig: WorkspaceConfig, localConfig: any, localPath: string): WorkspaceConfig {
const rootVersion = cleanVersion(rootConfig.version) ?? "0.0.0"
const localVersion = cleanVersion(localConfig.baseVersion) ?? "0.0.0"
  if (rootVersion === localVersion) {
    console.log(`✅ Workspace config already up-to-date (v${rootVersion})`);
    return localConfig;
  }

  const merged = {
    ...rootConfig,
    ...localConfig,
    link: { ...rootConfig.link, ...localConfig.link },
    baseVersion: rootVersion,
    lastSynced: new Date().toISOString(),
  };

  fs.writeFileSync(localPath, stringify(merged));
  console.log(`📝 Updated ${path.basename(localPath)} to match root v${rootVersion}`);
  return merged;
}


function loadWorkspaceConfig(): WorkspaceConfig {
  const rootConfig = loadRootConfig()
  let localConfig: any = {}

  if (fs.existsSync(yamlPath)) {
    console.log(`📘 Using local workspace.links.yaml`)
    const content = fs.readFileSync(yamlPath, 'utf8')
    localConfig = parse(content)
  } else {
    console.log(`📗 No local config found — creating from root fallback.`)
  }

  return syncWorkspaceConfig(rootConfig, localConfig, yamlPath)
}

// 🧩 Safe symlink creation
function safeLinkPackage(pkgName: string, pkgPath: string, appNodeModules: string) {

  const target = path.join(appNodeModules, pkgName);
  const resolvedPkg = path.resolve(pkgPath);
  const resolvedTarget = path.resolve(target);

if (resolvedTarget.startsWith(resolvedPkg) || resolvedPkg.startsWith(resolvedTarget)) {
  console.warn(`🚫 Skipping ${pkgName} — would create recursive symlink: ${resolvedPkg} -> ${resolvedTarget}`);
  return;
}

  if (fs.existsSync(target)) {
    console.log(`ℹ️ Skipping existing link: ${pkgName}`);
    return;
  }

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    console.log(`🔗 Linking ${pkgName} → ${resolvedPkg}`);
    const stat = fs.lstatSync(resolvedPkg);
    const type: fs.symlink.Type = stat.isDirectory() ? (process.platform === "win32" ? "junction" : "dir") : "file"
    fs.symlinkSync(resolvedPkg, target, type)
    console.log(`🔗 Linked ${pkgName} → ${resolvedPkg}`)
  } catch (e) {
    console.error(`❌ Failed to link ${pkgName}:`, e);
  }
}

// 🧩 Ensure app/node_modules → root/node_modules link
// try {
//   if (fs.existsSync(rootNodeModulesPath)) {
//     if (!fs.existsSync(appNodeModulesPath)) {
//       console.log(`🔗 Creating symlink: ${appNodeModulesPath} -> ${rootNodeModulesPath}`);
//       if (path.resolve(appNodeModulesPath) !== path.resolve(rootNodeModulesPath)) {
//         fs.symlinkSync(rootNodeModulesPath, appNodeModulesPath, "junction");
//       }
//     } else {
//       console.log(`ℹ️ Symlink already exists: ${appNodeModulesPath}`);
//     }
//   } else {
//     console.warn(`⚠️ rootNodeModulesPath missing: ${rootNodeModulesPath}`);
//   }
// } catch (e) {
//   console.error(`❌ Failed to create app→root symlink: ${e instanceof Error ? e.message : String(e)}`);
// }


// 🧩 Main execution
export default function linkConfigs() {
  scanAndFixCircularSymlinks(appNodeModulesPath)
  
  // If no workspace root found, skip workspace linking (standalone mode)
  if (!workspaceRoot) {
    console.log(`ℹ️ Running in standalone mode - workspace linking skipped.`);
    return;
  }
  
  const config = loadWorkspaceConfig();

  if (!config || !config.enabled || !config.link) {
    console.log(`ℹ️ Workspace linking disabled or no link targets found.`);
    return;
  }

  console.log(`🔗 Linking workspace dependencies from root: ${workspaceRoot}`);

  for (const [pkg, enabled] of Object.entries(config.link)) {
    if (!enabled) continue;

    // compute safe, correct source path from root
    const segments = pkg.replace(/^@/, "").split("/");
    const pkgPath = path.join(workspaceRoot, "src", ...segments);
    if (pkgPath.includes("node_modules")) {
      console.warn(`🚫 Skipping ${pkg} — source is already inside node_modules.`);
      continue;
    }
    if (!fs.existsSync(pkgPath)) {
      console.warn(`⚠️ Skipping ${pkg} — missing path: ${pkgPath}`);
      continue;
    }
    for (const e of Object.entries(exclusion)) {
      if (pkgPath.includes(`src/${e}`)) {
        console.warn(`🚫 Skipping ${pkg} — linking inside core is not allowed.`);
        continue;
      }
    }
    if (pkgPath.includes(`src/${exclusion}`)) {
      console.warn(`🚫 Skipping ${pkg} — linking inside core is not allowed.`);
      continue;
    }

    safeLinkPackage(pkg, pkgPath, appNodeModulesPath);
  }

  console.log("✅ Workspace linking complete.");
}
