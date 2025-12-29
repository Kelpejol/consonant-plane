// src/db/adapter.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { detectProvider, DbConfig } from './config.js';
import { logger } from '../utils/logger.js';

/**
 * Creates the appropriate database adapter based on the DATABASE_URL.
 * 
 * IMPORTANT: This dynamically detects the provider at runtime from DATABASE_URL.
 * The schema.prisma file has a static provider field (e.g., "sqlite"), but Prisma
 * uses the adapter to determine the actual database behavior.
 * 
 * This approach ensures:
 * - No file writes needed
 * - Works with static artifacts
 * - Compatible with bundled applications
 * - Provider detected from environment at runtime
 * 
 * @param databaseUrl - Optional database URL. If not provided, uses process.env.DATABASE_URL
 * @returns The Prisma adapter instance for the detected provider
 */
export function createAdapter(databaseUrl?: string): any {
  // Temporarily override DATABASE_URL if custom URL provided
  const originalUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  try {
    const dbConfig = detectProvider();
    const adapter = createAdapterFromConfig(dbConfig);
    
    logger.info(`[DB Adapter] Created ${dbConfig.provider} adapter (detected from DATABASE_URL)`);
    return adapter;
  } finally {
    // Restore original URL
    if (databaseUrl) {
      if (originalUrl) {
        process.env.DATABASE_URL = originalUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  }
}

/**
 * Creates adapter from a DbConfig object.
 * The adapter tells Prisma which database driver to actually use,
 * regardless of what's written in schema.prisma.
 */
function createAdapterFromConfig(config: DbConfig): any {
  switch (config.provider) {
    case 'postgresql':
      return new PrismaPg({ 
        connectionString: config.connectionString 
      });
      
    case 'mysql':
      if (!config.host || !config.user || !config.database) {
        throw new Error('[DB Adapter] MySQL requires host, user, and database');
      }
      return new PrismaMariaDb({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: config.port,
        connectionLimit: 5,
      });
      
    case 'sqlite':
      return new PrismaBetterSqlite3({ 
        url: config.connectionString 
      });
      
    default:
      throw new Error(`Unsupported database provider: ${config.provider}`);
  }
}