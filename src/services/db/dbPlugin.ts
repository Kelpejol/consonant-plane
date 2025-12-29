import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { prismaManager } from './manager.js';
import { logger } from "../../utils/logger.js";

// Extend FastifyRequest type to include prisma
declare module 'fastify' {
  interface FastifyRequest {
    prisma: any; // Replace 'any' with your PrismaClient type if available
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // 1. Ensure Database is Ready (Pre-Handler Hook)
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      if (!prismaManager.isReady()) {
        logger.warn('[DB Middleware] Database not ready, initializing...');
        await prismaManager.initialize();
      }
    } catch (error: any) {
      logger.error('[DB Middleware] Database initialization failed:', error);
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Database is not ready.',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // 2. Track Active Requests (Request Lifecycle Hooks)
  fastify.addHook('onRequest', async () => {
    prismaManager.incrementActiveRequests();
  });

  fastify.addHook('onResponse', async () => {
    prismaManager.decrementActiveRequests();
  });

  // 3. Attach Prisma Client to Request
  fastify.addHook('preHandler', async (request) => {
    try {
      const client = await prismaManager.getClient();
      request.prisma = client;
    } catch (error: any) {
      logger.error('[DB Middleware] Failed to attach Prisma client:', error);
      throw new Error('Database connection failed');
    }
  });

  // 4. Health Check Route
  fastify.get('/health/db', async (request, reply) => {
    try {
      const isReady = prismaManager.isReady();
      if (!isReady) {
        return reply.status(503).send({
          status: 'unavailable',
          database: { connected: false, message: 'Database not initialized' },
        });
      }

      const client = await prismaManager.getClient();
      await client.$queryRaw`SELECT 1`;

      const currentUrl = prismaManager.getCurrentDatabaseUrl();
      
      return {
        status: 'healthy',
        database: {
          connected: true,
          provider: currentUrl ? new URL(currentUrl).protocol.replace(':', '') : 'unknown',
          activeRequests: prismaManager.getActiveRequestCount(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error('[DB Middleware] Health check failed:', error);
      return reply.status(503).send({
        status: 'unhealthy',
        database: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  });
};

// Wrap with fastify-plugin so it's accessible across your entire app
export default fp(dbPlugin);