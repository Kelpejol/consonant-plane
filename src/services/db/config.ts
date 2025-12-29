// src/db/config.ts
import { logger } from "../../utils/logger.js";
import { config } from 'dotenv';
import { URL } from 'url';

config();

export type DbProvider = 'postgresql' | 'mysql' | 'sqlite';

export interface DbConfig {
  provider: DbProvider;
  connectionString: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

/**
 * Parses DATABASE_URL and extracts connection details
 * Implements environment-specific defaults and validation
 */
export function detectProvider(): DbConfig {
  const env = process.env.NODE_ENV || 'development';
  let dbUrl: string | undefined = process.env.DATABASE_URL;

  // Environment-specific logic
  if (!dbUrl || dbUrl.trim() === '') {
    if (env === 'production') {
      throw new Error(
        '[DB Config] ❌ PRODUCTION ERROR: DATABASE_URL environment variable is required.'
      );
    }

    if (env === 'test') {
      const testUrl = 'file:./test.db';
      logger.warn(
        `[DB Config] Running in 'test' environment. Defaulting to SQLite: ${testUrl}`
      );
      return {
        provider: 'sqlite',
        connectionString: testUrl,
      };
    }

    // Development default
    const defaultUrl = 'file:./local.db';
    logger.warn(
      `[DB Config] DATABASE_URL not set. Defaulting to SQLite: ${defaultUrl}`
    );
    return {
      provider: 'sqlite',
      connectionString: defaultUrl,
    };
  }

  // Parse the DATABASE_URL
  try {
    // Handle file:// URLs for SQLite
    if (dbUrl.startsWith('file:')) {
      return {
        provider: 'sqlite',
        connectionString: dbUrl,
      };
    }

    const parsedUrl = new URL(dbUrl);
    const protocol = parsedUrl.protocol.replace(':', '').toLowerCase();

    let provider: DbProvider;
    switch (protocol) {
      case 'postgresql':
      case 'postgres':
        provider = 'postgresql';
        break;
      case 'mysql':
        provider = 'mysql';
        break;
      case 'sqlite':
        provider = 'sqlite';
        break;
      default:
        throw new Error(
          `Unsupported database protocol: "${protocol}". Supported: postgresql, mysql, sqlite.`
        );
    }

    // Extract connection details for PostgreSQL/MySQL
    if (provider === 'postgresql' || provider === 'mysql') {
      return {
        provider,
        connectionString: dbUrl,
        host: parsedUrl.hostname,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
        user: parsedUrl.username || undefined,
        password: parsedUrl.password || undefined,
        database: parsedUrl.pathname.slice(1) || undefined,
      };
    }

    return {
      provider,
      connectionString: dbUrl,
    };
  } catch (error) {
    throw new Error(
      `[DB Config] ❌ Invalid DATABASE_URL format: ${dbUrl}. Error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Validates that required environment variables are set for the detected provider
 */
export function validateDbConfig(config: DbConfig): void {
  if (config.provider === 'postgresql' || config.provider === 'mysql') {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
      if (!config.host || !config.database) {
        throw new Error(
          `[DB Config] ❌ Production ${config.provider} requires host and database in DATABASE_URL`
        );
      }
    }
  }
  
  logger.info(`[DB Config] Validated configuration for ${config.provider}`);
}