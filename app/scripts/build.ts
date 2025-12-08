/**
 * Production build script with enhanced error handling and validation
 */
import { createLogger } from './logger';
import { execStrict } from './exec-safe';
import fs from 'fs';
import path from 'path';
import paths from './paths';
import type { BuildConfig } from './types';

const logger = createLogger('build');

interface BuildOptions {
  minify?: boolean;
  sourcemap?: boolean;
  clean?: boolean;
}

async function buildSection(config: BuildConfig, options: BuildOptions = {}) {
  const { name, config: configPath } = config;
  
  logger.info(`Building ${name} process...`);
  
  // Set environment variables for build
  const env: Record<string, string> = {
    ...process.env,
    NODE_ENV: options.minify ? 'production' : 'development',
  };

  try {
    execStrict(
      `vite build --config "${configPath}"${options.sourcemap === false ? ' --no-sourcemap' : ''}`,
      { env },
      `build-${name}`
    );
    
    logger.success(`${name} build complete`);
    return true;
  } catch (error) {
    logger.error(`Failed to build ${name}`, error);
    return false;
  }
}

async function validateBuild() {
  logger.section("Validating Build Output");
  
  const requiredOutputs = [
    { path: path.join(paths.distPath, 'main/index.js'), name: 'Main process' },
    { path: path.join(paths.distPath, 'preload/index.js'), name: 'Preload script' },
    { path: path.join(paths.distPath, 'renderer/index.html'), name: 'Renderer HTML' },
  ];

  let valid = true;
  for (const output of requiredOutputs) {
    if (fs.existsSync(output.path)) {
      logger.success(`${output.name}: ✓`);
    } else {
      logger.error(`${output.name}: ✗ (missing: ${output.path})`);
      valid = false;
    }
  }

  return valid;
}

async function main() {
  logger.section("Production Build");
  
  const options: BuildOptions = {
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.VITE_BUILD_SOURCEMAP !== 'false',
    clean: true,
  };

  // Clean dist directory if requested
  if (options.clean && fs.existsSync(paths.distPath)) {
    logger.info("Cleaning existing build output...");
    try {
      execStrict(`pnpm dlx rimraf "${paths.distPath}"`, {}, 'clean');
      logger.success("Build directory cleaned");
    } catch (error) {
      logger.warn(`Failed to clean build directory: ${error}`);
    }
  }

  // Build configurations
  const configsDir = path.resolve(__dirname, '../configs');
  const builds: BuildConfig[] = [
    { name: 'main', config: path.join(configsDir, 'vite.main.config.ts') },
    { name: 'preload', config: path.join(configsDir, 'vite.preload.config.ts') },
    { name: 'renderer', config: path.join(configsDir, 'vite.renderer.config.ts') },
  ];

  logger.info(`Build mode: ${options.minify ? 'production' : 'development'}`);
  logger.info(`Source maps: ${options.sourcemap ? 'enabled' : 'disabled'}`);

  // Build each section
  const results: boolean[] = [];
  for (const buildConfig of builds) {
    const success = await buildSection(buildConfig, options);
    results.push(success);
    
    if (!success) {
      logger.error(`Build failed for ${buildConfig.name}`);
      process.exit(1);
    }
  }

  // Validate output
  const isValid = await validateBuild();
  if (!isValid) {
    logger.error("Build validation failed");
    process.exit(1);
  }

  logger.section("Build Complete");
  logger.success("All build sections completed successfully!");
  logger.info(`Output directory: ${paths.distPath}`);
}

main().catch((error) => {
  logger.error("Build failed", error);
  process.exit(1);
});
