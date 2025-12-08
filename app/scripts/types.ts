/**
 * Type definitions for build scripts
 */

export interface BuildConfig {
  name: string;
  config: string;
}

export interface PathConfig {
  rootPath: string;
  srcPath: string;
  srcMainPath: string;
  srcRendererPath: string;
  localRootPath: string;
  workspaceConfigPath: string;
  rootPackagePath: string;
  appPath: string;
  appPackagePath: string;
  appNodeModulesPath: string;
  srcNodeModulesPath: string;
  rootNodeModulesPath: string;
  distPath: string;
  distMainPath: string;
  distRendererPath: string;
  buildPath: string;
}

export interface ExecOptions {
  cwd?: string;
  stdio?: 'inherit' | 'pipe' | 'ignore';
  env?: Record<string, string>;
}

export interface Logger {
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  section(title: string): void;
}

export interface WorkspaceConfig {
  version: string;
  enabled: boolean;
  link: Record<string, boolean>;
  baseVersion?: string;
  lastSynced?: string;
}
