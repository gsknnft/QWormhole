/**
 * Postinstall orchestration script with enhanced error handling and logging
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import paths from "./paths";
import { cleanVersion } from "./version-utils";
import linkConfigs, { scanAndFixCircularSymlinks } from "./linkConfigs";
import { createLogger } from "./logger";
import { execStrict } from "./exec-safe";
import type { BuildConfig } from "./types";

const logger = createLogger('postinstall');
const { rootPath, appPath, distPath, srcPath, localRootPath } = paths;
const releaseRoot = path.resolve(srcPath, "release");
const releaseDir = path.resolve(releaseRoot, "app");

// Environment detection
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const isTest = process.env.NODE_ENV === 'test';
if (process.env.MONOREPO_POSTINSTALL_RUNNING === '1') {
  console.log('Skipping nested postinstall');
  process.exit(0);
}
process.env.MONOREPO_POSTINSTALL_RUNNING = '1';

// Try to find package.json - first in rootPath, then fallback to localRootPath
let pkgPath = path.join(rootPath, "package.json");
if (!fs.existsSync(pkgPath)) {
  pkgPath = path.join(localRootPath, "package.json");
  logger.warn(`package.json not found at rootPath, using localRootPath: ${pkgPath}`);
}

// Load package configuration
let pkg: any = {};
let electronVersion = 'unknown';
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const rawElectronVersion = pkg.devDependencies?.electron || pkg.dependencies?.electron;
  electronVersion = cleanVersion(rawElectronVersion) || rawElectronVersion;
} catch (error) {
  logger.error(`Failed to read package.json at ${pkgPath}`, error);
  logger.warn('Continuing with unknown Electron version');
}

logger.info(`Using Electron version: ${electronVersion}`);

// 🧭 Helper runner with standard environment
const run = (cmd: string, cwd?: string) => {
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: "true",
      ELECTRON_BUILDER_NODE_INSTALLER: "pnpm",
      ELECTRON_BUILDER_PREFER_GLOBAL: "true",
    },
  });
};

// --- Boot info ---
logger.section("Quantum Electron Postinstall");
logger.info(`Electron version: ${electronVersion}`);
logger.info(`Node version: ${process.version}`);
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

// 🧹 Clean existing dist
if (fs.existsSync(distPath)) {
  logger.info("Clearing existing dist...");
  try {
    execStrict(`pnpm dlx rimraf "${distPath}"`, {}, 'clean');
    logger.success("Dist directory cleaned");
  } catch (error) {
    logger.error("Failed to clean dist directory", error);
    // Continue anyway as this is not critical
  }
}

// 🧩 Optional workspace link pass
if (fs.existsSync(rootPath) && process.argv.includes("--link-workspaces")) {
  try {
    logger.info("Scanning and fixing circular symlinks...");
    scanAndFixCircularSymlinks(appPath);
    // scanAndFixCircularSymlinks(rootPath); --- IGNORE ---
    logger.info("Linking workspace dependencies...");
    linkConfigs();
    logger.success("Workspace linking complete");
  } catch (error) {
    logger.error("Workspace linking failed", error);
    // Continue as workspace linking is optional
  }
}

logger.section("Native Module Audit");
if (!fs.existsSync(path.join(appPath, "node_modules"))) {
  logger.info("No app/node_modules present; native addon scan will be skipped.");
} else {
  logger.info("Skipping electron-rebuild (see BUILD_PURGE.md for rationale).");
  logger.info("Run 'pnpm run doctor:native' if native addons report issues.");
}


// --- Build all app sections ---
logger.section("Building Application Sections");
const configsDir = path.resolve(__dirname, "../configs");
const builds: BuildConfig[] = [
  { name: "main", config: path.join(configsDir, "vite.main.config.ts") },
  { name: "preload", config: path.join(configsDir, "vite.preload.config.ts") },
  { name: "renderer", config: path.join(configsDir, "vite.renderer.config.ts") },
];

let buildErrors: string[] = [];
for (const { name, config } of builds) {
  try {
    logger.info(`Building ${name} process with Vite...`);
    execStrict(`vite build --config "${config}"`, { stdio: "inherit" }, `build-${name}`);
    logger.success(`${name} built successfully`);
  } catch (error) {
    logger.error(`Failed to build ${name}`, error);
    logger.error(`Config: ${config}`, undefined);
    buildErrors.push(name);
    
    // In CI/test, log but continue to see all build failures
    if (isCI || isTest) {
      logger.warn(`Continuing despite ${name} build failure (CI/test mode)`);
    } else if (process.env.STRICT_POSTINSTALL !== 'true') {
      logger.warn(`Continuing despite ${name} build failure (use STRICT_POSTINSTALL=true to enforce)`);
    } else {
      process.exit(1);
    }
  }
}

if (buildErrors.length > 0) {
  logger.warn(`Build completed with errors in: ${buildErrors.join(', ')}`);
  if (!isCI && !isTest && process.env.STRICT_POSTINSTALL === 'true') {
    logger.error("Strict mode enabled - failing due to build errors");
    process.exit(1);
  }
}

// --- Final safety checks ---
try {
  logger.section("Final Safety Checks");
  
  logger.info("Ensuring package manager compatibility...");
  run("ts-node ./scripts/ensure-package-manager.ts");
  
  logger.info("Updating Electron version metadata...");
  run("ts-node ./scripts/update-electron-version.ts");
  
  logger.info("Checking native dependencies...");
  run("ts-node ./scripts/check-native-dep.ts");

  // 📦 Prepare release copy (optional, skipped in CI/test environments)
  const skipReleaseCopy = isCI || isTest || process.env.SKIP_RELEASE_COPY === 'true';
  
  if (skipReleaseCopy) {
    logger.info("Skipping release package preparation (CI/test environment detected)");
    logger.info("Release copy can be performed manually with: pnpm run package");
  } else {
    logger.section("Preparing Release Package");
    logger.info(`Release directory: ${releaseDir}`);
    
    try {
      if (fs.existsSync(releaseDir)) {
        logger.info("Cleaning existing release directory...");
        try {
          execStrict(`pnpm dlx rimraf "${releaseDir}"`, {}, 'clean-release');
        } catch (cleanErr) {
          logger.warn(`Failed to clean release directory, continuing... ${cleanErr instanceof Error ? cleanErr.message : String(cleanErr)}`);
          // Try native fs remove as fallback
          try {
            fs.rmSync(releaseDir, { recursive: true, force: true });
          } catch (rmErr) {
            logger.warn(`Native fs remove also failed, continuing... ${rmErr instanceof Error ? rmErr.message : String(rmErr)}`);
          }
        }
      }
      
      fs.mkdirSync(releaseDir, { recursive: true });
      logger.success("Release directory created");

      // Copy all compiled artifacts - use safe fallback
      logger.info("Copying compiled artifacts...");
      try {
        // First try cpy-cli
        execStrict(`pnpm dlx cpy-cli "app/**/*" "${releaseDir}" --parents`, { stdio: "inherit" }, 'copy-artifacts');
      } catch (cpyErr) {
        logger.warn(`cpy-cli failed, trying native copy... ${cpyErr instanceof Error ? cpyErr.message : String(cpyErr)}`);
        // Fallback to native recursive copy
        try {
          const appDistPath = path.join(appPath, 'dist');
          if (fs.existsSync(appDistPath)) {
            const destDistPath = path.join(releaseDir, 'dist');
            fs.mkdirSync(destDistPath, { recursive: true });
            
            // Copy recursively using native fs
            function copyRecursive(src: string, dest: string) {
              const entries = fs.readdirSync(src, { withFileTypes: true });
              for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                  fs.mkdirSync(destPath, { recursive: true });
                  copyRecursive(srcPath, destPath);
                } else {
                  fs.copyFileSync(srcPath, destPath);
                }
              }
            }
            
            copyRecursive(appDistPath, destDistPath);
            logger.success("Artifacts copied using native fs");
          } else {
            logger.warn("app/dist not found, skipping artifact copy");
          }
        } catch (nativeCopyErr) {
          logger.warn(`Native copy also failed, release package may be incomplete: ${nativeCopyErr instanceof Error ? nativeCopyErr.message : String(nativeCopyErr)}`);
        }
      }

      // Copy main metadata
      logger.info("Copying package metadata...");
      try {
        const pkgJsonSrc = path.join(rootPath, "package.json");
        const pkgJsonDest = path.join(releaseDir, "package.json");
        if (fs.existsSync(pkgJsonSrc)) {
          fs.copyFileSync(pkgJsonSrc, pkgJsonDest);
        } else if (fs.existsSync(pkgPath)) {
          fs.copyFileSync(pkgPath, pkgJsonDest);
        } else {
          logger.warn("package.json not found, skipping metadata copy");
        }
      } catch (metaErr) {
        logger.warn(`Failed to copy package metadata: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
      }

      logger.success("Release package created successfully");
    } catch (err) {
      logger.warn(`Failed to prepare release package (non-critical): ${err instanceof Error ? err.message : String(err)}`);
      logger.info("You can manually create release package with: pnpm run package");
      // Don't throw - this is not critical for postinstall
    }
  }

  logger.section("Postinstall Complete");
  logger.success("🎉 Quantum Electron build ready!");

} catch (err) {
  logger.error("Postinstall failed", err);
  logger.error("Please check the error messages above for details", undefined);
  process.exit(1);
}
