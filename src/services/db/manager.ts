// src/db/manager.ts
import { PrismaClient } from '../generated/prisma/client.js';
import { Mutex } from 'async-mutex';
import { createAdapter } from './adapter.js';
import { connectWithRetry, disconnect } from './connection.js';
import { logger } from '../utils/logger.js';

/**
 * Thread-safe Prisma client manager for production environments.
 * 
 * DESIGN PRINCIPLES:
 * - DATABASE_URL read once at startup
 * - Any env change requires full restart with SIGTERM
 * - Immutable after initialization
 * 
 * Features:
 * - Singleton pattern for single client instance
 * - Thread-safe operations using mutex
 * - Connection retry logic
 * - Active request tracking for graceful shutdown
 */

//all this should be in memory
class PrismaManager {
  private client: PrismaClient | null = null;
  private currentDatabaseUrl: string | null = null;
  private mutex = new Mutex();
  private activeRequests = 0;
  private isInitialized = false;

  constructor() {
    logger.info('[Prisma Manager] Initializing manager');
  }

  /**
   * Initialize the Prisma client with the current DATABASE_URL.
   * This must be called after database initialization (migrations/push).
   * 
   * IMPORTANT: This can only be called ONCE. Any DATABASE_URL change
   * requires a full application restart.
   */
  async initialize(): Promise<void> {
    return this.mutex.runExclusive(async () => {
      if (this.isInitialized) {
        logger.info('[Prisma Manager] Already initialized');
        return;
      }

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error(
          '[Prisma Manager] DATABASE_URL not set. Please set it before initializing.'
        );
      }

      logger.info('[Prisma Manager] Initializing client...');
      

      const adapter = createAdapter();
      const client = new PrismaClient({ adapter });
       
      const result = await connectWithRetry(client);
      
      if (!result.success) {
        await client.$disconnect();
        throw new Error(
          `[Prisma Manager] Failed to connect: ${result.error}`
        );
      }
      this.client = client;
      this.currentDatabaseUrl = databaseUrl;
      this.isInitialized = true;
      
      logger.success('[Prisma Manager] Initialized successfully');
      logger.info('[Prisma Manager] Configuration immutable - restart to change');
    });
  }

  /**
   * Get the current Prisma client instance.
   * Automatically initializes if not yet initialized.
   */
  async getClient(): Promise<PrismaClient> {
    if (!this.client) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('[Prisma Manager] Failed to initialize client');
    }

    return this.client;
  }

  /**
   * Get current database URL (read-only)
   */
  getCurrentDatabaseUrl(): string | null {
    return this.currentDatabaseUrl;
  }

  /**
   * Check if manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Track active request (for graceful shutdown)
   */
  incrementActiveRequests(): void {
    this.activeRequests++;
  }

  /**
   * Track completed request
   */
  decrementActiveRequests(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.activeRequests;
  }

  /**
   * Gracefully disconnect client and reset state.
   * Called during shutdown (SIGTERM/SIGINT).
   */
  async disconnect(): Promise<void> {
    return this.mutex.runExclusive(async () => {
      if (this.client) {
        logger.info('[Prisma Manager] Disconnecting client...');
        
        // Wait for active requests to complete (with timeout)
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();
        
        while (this.activeRequests > 0 && (Date.now() - startTime) < maxWait) {
          logger.info(
            `[Prisma Manager] Waiting for ${this.activeRequests} active requests...`
          );
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (this.activeRequests > 0) {
          logger.warn(
            `[Prisma Manager] Force disconnecting with ${this.activeRequests} active requests`
          );
        }

        await disconnect(this.client);
        this.client = null;
        this.currentDatabaseUrl = null;
        this.isInitialized = false;
        
        logger.success('[Prisma Manager] Disconnected successfully');
      }
    });
  }

  /**
   * Reset manager to uninitialized state
   */
  async reset(): Promise<void> {
    await this.disconnect();
    logger.info('[Prisma Manager] Reset complete');
  }
}

// Export singleton instance
export const prismaManager = new PrismaManager();

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  logger.info(`[Prisma Manager] Received ${signal}, shutting down gracefully...`);
  await prismaManager.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('beforeExit', async () => {
  await prismaManager.disconnect();
});

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
  logger.error('[Prisma Manager] Uncaught exception:', error);
  await prismaManager.disconnect();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error('[Prisma Manager] Unhandled rejection:', reason);
  await prismaManager.disconnect();
  process.exit(1);
});