// src/db/connection.ts
import { PrismaClient } from '../generated/prisma/client.js';
import { detectProvider } from './config.js';
import { logger } from '../utils/logger.js';

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

export interface ConnectionResult {
  success: boolean;
  client?: PrismaClient;
  error?: string;
  retries: number;
}

/**
 * Connects a Prisma client with exponential backoff retry logic.
 * This function handles connection establishment and testing.
 * 
 * @param client - The Prisma client to connect
 * @param maxRetries - Maximum number of connection attempts
 * @returns Connection result with success status
 */
export async function connectWithRetry(
  client: PrismaClient,
  maxRetries: number = MAX_RETRIES
): Promise<ConnectionResult> {

  //detect provider twice
  const dbConfig = detectProvider();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.info(
        `[DB Connection] Attempt ${attempt + 1}/${maxRetries} to connect to ${dbConfig.provider}`
      );
      
      // Connect to database
      await client.$connect();
      
      // Test the connection with a simple query
      await testConnection(client);
      
      logger.success(
        `[DB Connection] Connected to ${dbConfig.provider}${
          attempt > 0 ? ` after ${attempt} retries` : ''
        }`
      );
      
      return {
        success: true,
        client,
        retries: attempt,
      };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      
      logger.error(
        `[DB Connection] Attempt ${attempt + 1}/${maxRetries} failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );

      if (isLastAttempt) {
        // Final attempt failed - disconnect and return error
        try {
          await client.$disconnect();
        } catch (disconnectError) {
          logger.warn('[DB Connection] Failed to disconnect after failed connection');
        }
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
          retries: attempt + 1,
        };
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        INITIAL_DELAY_MS * Math.pow(2, attempt),
        MAX_DELAY_MS
      );
      
      logger.info(`[DB Connection] Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs this
  return {
    success: false,
    error: 'Max retries exceeded',
    retries: maxRetries,
  };
}

/**
 * Tests database connection with a simple query
 */
async function testConnection(client: PrismaClient): Promise<void> {
  //detect provider twice
  const dbConfig = detectProvider();
  
  try {
    switch (dbConfig.provider) {
      case 'postgresql':
      case 'mysql':
        await client.$queryRaw`SELECT 1`;
        break;
      case 'sqlite':
        await client.$queryRaw`SELECT 1`;
        break;
    }
    
    logger.info('[DB Connection] Connection test passed');
  } catch (error) {
    logger.error('[DB Connection] Connection test failed');
    throw error;
  }
}


/**
 * Gracefully disconnects a Prisma client
 */
export async function disconnect(client: PrismaClient): Promise<void> {
  try {
    await client.$disconnect();
    logger.info('[DB Connection] Disconnected successfully');
  } catch (error) {
    logger.error('[DB Connection] Error during disconnect:', error);
    throw error;
  }
}