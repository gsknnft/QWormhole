/**
 * Structured logging utility for build scripts
 */
import { Logger } from './types';
import chalk from 'chalk';

// Dynamic import of chalk to handle both CommonJS and ESM contexts

class BuildLogger implements Logger {
  private context: string;

  constructor(context: string = 'build') {
    this.context = context;
  }

  info(message: string): void {
    console.log(chalk.blue('ℹ️'), chalk.gray(`[${this.context}]`), message);
  }

  success(message: string): void {
    console.log(chalk.green('✅'), chalk.gray(`[${this.context}]`), message);
  }

  warn(message: string): void {
    console.warn(chalk.yellow('⚠️'), chalk.gray(`[${this.context}]`), message);
  }

  error(message: string, error?: unknown): void {
    console.error(chalk.red('❌'), chalk.gray(`[${this.context}]`), message);
    if (error) {
      if (error instanceof Error) {
        console.error(chalk.red('   '), error.message);
        if (error.stack) {
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red('   '), String(error));
      }
    }
  }

  section(title: string): void {
    const separator = '═════════════════════════════════════════════════════════════';
    console.log('\n' + chalk.bold.cyan(separator));
    console.log(chalk.bold.cyan(`  ${title}`));
    console.log(chalk.bold.cyan(separator) + '\n');
  }
}

export function createLogger(context?: string): Logger {
  return new BuildLogger(context);
}

export default createLogger;
