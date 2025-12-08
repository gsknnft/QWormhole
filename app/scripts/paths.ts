import * as path from 'path';
import * as fs from 'node:fs';
// import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot } from './workspace';

// Determine root path - use localRootPath for standalone, or search up for monorepo root
//const __dirnamePath = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const localRootPath = path.resolve(__dirname, '../');
const rootPath = findWorkspaceRoot(localRootPath);

// Allow both monorepo and standalone
const appPath = fs.existsSync(path.join(localRootPath, 'app'))
  ? path.join(localRootPath, 'app')
  : path.join(rootPath, 'quantum-electron', 'app'); // fallback for monorepo structure

console.log('[alias-debug] Resolved @app =>', path.resolve(rootPath, 'src/app'));

const srcPath = path.join(localRootPath, 'src');
const srcMainPath = path.join(srcPath, 'main');
const srcRendererPath = path.join(srcPath, 'renderer');

const workspaceConfigPath = path.join(localRootPath, 'configs/workspace.links.yaml');

// const defaultRootConfigPath = path.join(localRootPath, 'configs/default.root.yaml');

const appPackagePath = path.join(appPath, 'package.json');
const appNodeModulesPath = path.join(appPath, 'node_modules');
const srcNodeModulesPath = path.join(srcPath, 'node_modules');
const rootNodeModulesPath = path.join(rootPath, 'node_modules');
const rootPackagePath = path.join(rootPath, 'package.json');

const distPath = path.join(appPath, 'dist');
const distMainPath = path.join(distPath, 'main');
const distRendererPath = path.join(distPath, 'renderer');

const buildPath = path.join(localRootPath, 'build');

export default {
  rootPath,
  srcPath,
  srcMainPath,
  srcRendererPath,
  localRootPath,
  workspaceConfigPath,
  rootPackagePath,
  appPath,
  appPackagePath,
  appNodeModulesPath,
  srcNodeModulesPath,
  rootNodeModulesPath,
  distPath,
  distMainPath,
  distRendererPath,
  buildPath,
};
