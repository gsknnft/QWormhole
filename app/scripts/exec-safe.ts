/**
 * Safe command execution wrapper with proper error handling
 */
import { execSync } from 'node:child_process';
import type { ExecOptions } from './types';
import { createLogger } from './logger';

const logger = createLogger('exec');

export interface ExecResult {
  success: boolean;
  output?: string;
  error?: Error;
}

/**
 * Execute a command with proper error handling and logging
 */
export function execSafe(
  command: string,
  options: ExecOptions = {},
  context?: string
): ExecResult {
  const cmdLogger = context ? createLogger(context) : logger;
  
  try {
    cmdLogger.info(`Executing: ${command}`);
    const output = execSync(command, {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
    });

    return {
      success: true,
      output: output?.toString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    cmdLogger.error(`Command failed: ${command}`, error);
    
    return {
      success: false,
      error: error instanceof Error ? error : new Error(errorMessage),
    };
  }
}

/**
 * Execute a command and throw on failure
 */
export function execStrict(
  command: string,
  options: ExecOptions = {},
  context?: string
): string | undefined {
  const result = execSafe(command, options, context);
  
  if (!result.success) {
    throw result.error || new Error(`Command failed: ${command}`);
  }
  
  return result.output;
}

/**
 * Execute a command and return success status without throwing
 */
export function execSilent(
  command: string,
  options: ExecOptions = {},
  context?: string
): boolean {
  const result = execSafe(command, { ...options, stdio: 'pipe' }, context);
  return result.success;
}

export default execSafe;
