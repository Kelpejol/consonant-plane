// src/db/commands.ts
import { spawn } from 'child_process';
import { logger } from "../../utils/logger.js";

export interface CommandResult {
  success: boolean;
  output: string[];
  errors: string[];
  exitCode: number | null;
}

const DEFAULT_TIMEOUT = 120000; // 2 minutes

/**
 * Runs a Prisma command via npm script.
 * This handles all CLI operations for database migrations and schema management.
 * 
 * @param command - npm script name from package.json
 * @param args - Additional arguments to pass to the command
 * @param timeout - Command timeout in milliseconds
 * @returns Command execution result
 */
export async function runPrismaCommand(
  command: string,
  args: string[] = [],
  timeout: number = DEFAULT_TIMEOUT
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const output: string[] = [];
    const errors: string[] = [];

    logger.info(`[Prisma CLI] Running: npm run ${command} ${args.join(' ')}`);

    // Use npm run to execute the package.json script
    const proc = spawn('npm', ['run', command, '--', ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
      shell: true,
    });

    // Set timeout
    const timer = setTimeout(() => {
      logger.warn(`[Prisma CLI] Command timed out after ${timeout}ms`);
      proc.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        proc.kill('SIGKILL');
      }, 5000);
    }, timeout);

    // Capture stdout
    proc.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      output.push(...lines);
      lines.forEach((line: string) => logger.info(`[Prisma CLI] ${line}`));
    });

    // Capture stderr
    proc.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      errors.push(...lines);
      lines.forEach((line: string) => logger.info(`[Prisma CLI] ${line}`));
    });

    // Handle completion
    proc.on('close', (code) => {
      clearTimeout(timer);

      const result: CommandResult = {
        success: code === 0,
        output,
        errors,
        exitCode: code,
      };

      if (code === 0) {
        logger.info(`[Prisma CLI] ✓ Command completed successfully`);
      } else {
        logger.error(`[Prisma CLI] Command failed with exit code ${code}`);
      }

      resolve(result);
    });

    // Handle errors
    proc.on('error', (error) => {
      clearTimeout(timer);
      errors.push(error.message);
      logger.error(`[Prisma CLI] Process error: ${error.message}`);
      
      resolve({
        success: false,
        output,
        errors,
        exitCode: null,
      });
    });
  });
}

/**
 * Generate Prisma client (runs prisma:multi-generate)
 * This internally calls prisma:sync first via the npm script
 */
export async function generatePrismaClient(): Promise<CommandResult> {
  logger.info('[Prisma CLI] Generating Prisma client...');
  return runPrismaCommand('prisma:generate');
}

/**
 * Run database migrations in development (runs prisma:multi-migrate)
 * This internally calls prisma:sync first via the npm script
 */
export async function runMigrations(migrationName?: string): Promise<CommandResult> {
  logger.info('[Prisma CLI] Running database migrations...');
  const args = migrationName ? ['--name', migrationName] : [];
  return runPrismaCommand('prisma:migrate', args);
}

/**
 * Deploy migrations in production (runs prisma:multi-migrate:deploy)
 * This internally calls prisma:sync first via the npm script
 * 
 * they should both run a script to select a configure the schema.prisma or so --------------------------------------------------------->
 */
export async function deployMigrations(): Promise<CommandResult> {
  logger.info('[Prisma CLI] Deploying migrations...');
  return runPrismaCommand('prisma:migrate:deploy');  
}


/**
 * Reset database (runs prisma:reset)
 * This internally calls prisma:sync first via the npm script
 */
export async function resetDatabase(): Promise<CommandResult> {
  logger.info('[Prisma CLI] Resetting database...');
  return runPrismaCommand('prisma:reset', ['--force']);
}

/**
 * Run Prisma Studio (runs prisma:studio)
 */
export async function openStudio(): Promise<CommandResult> {
  logger.info('[Prisma CLI] Opening Prisma Studio...');
  return runPrismaCommand('prisma:studio');
}