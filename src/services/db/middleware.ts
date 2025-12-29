// src/db/middleware.ts
import { Request, Response, NextFunction } from 'express';
import { prismaManager } from './manager.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to track active database requests.
 * This enables graceful shutdown by waiting for active requests to complete.
 * 
 * Usage:
 * app.use(trackDatabaseRequests);
 */
export function trackDatabaseRequests(
  req: Request,
  res: Response,
  next: NextFunction
): void {
   const start = Date.now();
    prismaManager.incrementActiveRequests();
  
  // Decrement counter when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
       logger.logRequest(req.method, req.path, res.statusCode, duration);
       prismaManager.decrementActiveRequests();
  });
  
  
  // Also handle errors
  res.on('close', () => {
    prismaManager.decrementActiveRequests();
  });
  
  next();
}

/**
 * Middleware to ensure database is initialized before handling requests.
 * Returns 503 Service Unavailable if database is not ready.
 * 
 * Usage:
 * app.use(ensureDatabaseReady);
 */
export async function ensureDatabaseReady(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!prismaManager.isReady()) {
      logger.warn('[DB Middleware] Database not ready, initializing...');
      await prismaManager.initialize();
    }

    logger.warn('[DB Middleware] Database is ready');
    next();
  } catch (error) {
    logger.error('[DB Middleware] Database initialization failed:', error);
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Database is not ready. Please try again later.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Middleware to attach Prisma client to request object.
 * Makes it easy to access the client in route handlers.
 * 
 * Usage:
 * app.use(attachPrismaClient);
 * 
 * Then in routes:
 * const user = await req.prisma.user.findUnique({ where: { id } });
 */
export async function attachPrismaClient(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const client = await prismaManager.getClient();
    (req as any).prisma = client;
    next();
  } catch (error) {
    logger.error('[DB Middleware] Failed to attach Prisma client:', error);
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Health check middleware - provides database status endpoint
 * 
 * Usage:
 * app.get('/health/db', databaseHealthCheck);
 */
export async function databaseHealthCheck(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const isReady = prismaManager.isReady();
    
    if (!isReady) {
      res.status(503).json({
        status: 'unavailable',
        database: {
          connected: false,
          message: 'Database not initialized',
        },
      });
      return;
    }

    // Test connection
    const client = await prismaManager.getClient();
    await client.$queryRaw`SELECT 1`;
    
    const currentUrl = prismaManager.getCurrentDatabaseUrl();
    const activeRequests = prismaManager.getActiveRequestCount();
    
    res.status(200).json({
      status: 'healthy',
      database: {
        connected: true,
        provider: currentUrl ? new URL(currentUrl).protocol.replace(':', '') : 'unknown',
        activeRequests,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[DB Middleware] Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: new Date().toISOString(),
    });
  }
}