import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import closeWithGrace from 'close-with-grace';
import { createServer } from 'http';
// import { RedisService } from './redis-service';
// import { QueueService, QueueName } from './queue-service';
import { randomBytes } from 'crypto';
// import { ClusterStatus, EventType, AgentRunStatus } from '@prisma/client';
import { prismaManager, dbPlugin } from './services/db/index.js';
import { clusterRoutes } from './routes/clusters.route.js';
import { logger } from './utils/logger.js';
import { contextManager } from './utils/context.js';
import { generateUUID } from './utils/crypto.js';
// import { createGrpcServer, GrpcServer } from './services/grpc/server.js';

import { serve } from 'inngest/fastify';
import { inngest } from './services/inngest/client.js';
import * as inngestFunctions from './services/inngest/functions/index.js';
import { agentRoutes } from './routes/agents.route.js';

// ============================================================================
// Server Configuration
// ============================================================================
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';
const UUID = generateUUID()


// gRPC Server Configuration
const GRPC_PORT = Number(process.env.GRPC_PORT) || 50051;
const GRPC_HOST = process.env.GRPC_HOST || '0.0.0.0';
const GRPC_TLS_ENABLED = process.env.GRPC_TLS_ENABLED === 'true';
const GRPC_TLS_CERT = process.env.GRPC_TLS_CERT;
const GRPC_TLS_KEY = process.env.GRPC_TLS_KEY;


const app: FastifyInstance = Fastify({
   logger: {
    level: IS_PROD ? 'info' : 'debug',
    transport: !IS_PROD
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  },
  disableRequestLogging: false,
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
});

// ============================================================================
// Service Instances
// ============================================================================

// let redis: RedisService;
// let queue: QueueService;
// let grpcServer: GrpcServer | null = null



// ============================================================================
// Service Setup Functions
// ============================================================================


const setupServices = async () => {
 app.log.info('[Server] 🚀 Initializing services...');
 
 // Initialize database
  app.log.info('[Server] 📊 Connecting to database...');
  await prismaManager.initialize(app.log);
  app.log.info('[Server] ✓ Database connected');




//   redis = new RedisService(
//     {
//       host: REDIS_HOST,
//       port: REDIS_PORT,
//       password: REDIS_PASSWORD,
//       keyPrefix: 'terra:',
//     },
//     app.log
//   );
//   await redis.connect();

//   queue = new QueueService(
//     {
//       redis: {
//         host: REDIS_HOST,
//         port: REDIS_PORT,
//         password: REDIS_PASSWORD,
//       },
//     },
//     app.log
//   );
//   await queue.initialize();

//   setupWorkers();
};

// const setupWorkers = () => {
//   queue.createWorker(
//     QueueName.CLUSTER_REGISTRATION,
//     async (job) => {
//       const { clusterId, kagentVersion, kagentConfig } = job.data;
//       await db.updateClusterStatus(clusterId, ClusterStatus.ACTIVE, kagentVersion, kagentConfig);
//       await redis.cacheCluster(clusterId, { status: 'active', kagentVersion });
//       return { success: true };
//     },
//     5
//   );

//   queue.createWorker(
//     QueueName.AGENT_INVOCATION,
//     async (job) => {
//       const { clusterId, requestId, agentName, input, parameters } = job.data;
      
//       await db.createAgentRun(clusterId, agentName, requestId, input, parameters);
      
//       const invoked = socketManager.invokeAgent(clusterId, {
//         requestId,
//         agentName,
//         input,
//         parameters,
//       });

//       if (!invoked) {
//         await db.updateAgentRunStatus(requestId, AgentRunStatus.FAILED, null, 'Cluster not connected');
//         throw new Error('Failed to invoke agent - cluster not connected');
//       }

//       return { success: true, requestId };
//     },
//     10
//   );

//   queue.createWorker(
//     QueueName.CLUSTER_HEALTH_CHECK,
//     async (job) => {
//       const { clusterId } = job.data;
//       const cluster = await db.getCluster(clusterId);
      
//       if (!cluster) {
//         return { healthy: false, reason: 'Cluster not found' };
//       }

//       const isConnected = socketManager.isClusterConnected(clusterId);
      
//       if (!isConnected && cluster.status === ClusterStatus.ACTIVE) {
//         await db.updateClusterStatus(clusterId, ClusterStatus.INACTIVE);
//         await redis.invalidateCluster(clusterId);
//       }

//       return { healthy: isConnected, clusterId };
//     },
//     20
//   );

//   queue.createWorker(
//     QueueName.EVENT_CLEANUP,
//     async (job) => {
//       const { daysToKeep } = job.data;
//       const deletedCount = await db.cleanupOldEvents(daysToKeep);
//       return { deletedCount };
//     },
//     1
//   );

//   queue.createWorker(
//     QueueName.EVENT_PROCESSING,
//     async (job) => {
//       const { clusterId, eventType, payload } = job.data;
//       await db.createEvent(clusterId, eventType as EventType, payload);
//       await redis.bufferEvent(clusterId, { type: eventType, payload, timestamp: Date.now() });
//       return { success: true };
//     },
//     50
//   );
// };

const setupPlugins = async (server: FastifyInstance) => {
  app.log.info('[Server] 🔌 Registering plugins...');

  // Security
  await server.register(helmet, {
    contentSecurityPolicy: false, // Disable for development
  });

  // CORS
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Compression
  await server.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate'],
  });

  // Database plugin
  await server.register(dbPlugin);
  
//   await server.register(rateLimit, {
//     max: 100,
//     timeWindow: '1 minute',
//     redis: redis.getClient(),
//   });
app.log.info('[Server] ✓ Plugins registered');
};


export async function buildApp(app: FastifyInstance) {
  await app.register(clusterRoutes, {
    prefix: '/api/v1',
  });

  await app.register(agentRoutes, { prefix: '/api/v1' });


      // Register Inngest endpoint
  app.all(
    '/api/inngest',
    serve({
      client: inngest,
      functions: inngestFunctions.allFunctions,
    })
  );

}

// const setupSocketHandlers = () => {
//   socketManager.on('cluster:validate', async (data) => {
//     app.log.info({ clusterId: data.clusterId }, 'Cluster validation request');
    
//     const isValid = await db.verifyClusterToken(data.clusterId, data.token);
//     if (!isValid) {
//       app.log.error({ clusterId: data.clusterId }, 'Invalid cluster token');
//     }
//   });

//   socketManager.on('cluster:registered', async (data) => {
//     app.log.info({ clusterId: data.clusterId }, 'Cluster registered');
    
//     await queue.addClusterRegistrationJob({
//       clusterId: data.clusterId,
//       clusterName: data.clusterName,
//       namespace: data.namespace,
//       kagentVersion: data.kagentVersion,
//       kagentConfig: data.kagentConfig,
//     });

//     await redis.trackActiveConnection(data.clusterId);
//   });

//   socketManager.on('cluster:disconnected', async (data) => {
//     app.log.warn({ clusterId: data.clusterId }, 'Cluster disconnected');
//     await redis.removeActiveConnection(data.clusterId);
//     await redis.invalidateCluster(data.clusterId);
//   });

//   socketManager.on('cluster:timeout', async (data) => {
//     app.log.error({ clusterId: data.clusterId }, 'Cluster heartbeat timeout');
//     await db.updateClusterStatus(data.clusterId, ClusterStatus.INACTIVE);
//     await redis.removeActiveConnection(data.clusterId);
//   });

//   socketManager.on('cluster:error', async (data) => {
//     app.log.error({ clusterId: data.clusterId, error: data }, 'Cluster error');
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'CLUSTER_ERROR',
//       payload: data,
//     });
//   });

//   socketManager.on('agent:trace', async (data) => {
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'AGENT_TRACE',
//       payload: data,
//     });
//   });

//   socketManager.on('agent:event', async (data) => {
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'AGENT_EVENT',
//       payload: data,
//     });
//   });

//   socketManager.on('k8s:event', async (data) => {
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'K8S_EVENT',
//       payload: data,
//     });
//   });

//   socketManager.on('k8s:pod:status', async (data) => {
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'K8S_POD_STATUS',
//       payload: data,
//     });
//   });

//   socketManager.on('otel:trace', async (data) => {
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'OTEL_TRACE',
//       payload: data,
//     });
//   });

//   socketManager.on('otel:metric', async (data) => {
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'OTEL_METRIC',
//       payload: data,
//     });
//   });

//   socketManager.on('invoke:response', async (data) => {
//     app.log.info({ clusterId: data.clusterId, requestId: data.requestId }, 'Invoke response');
//     await db.updateAgentRunStatus(data.requestId, AgentRunStatus.COMPLETED, data.result);
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'INVOKE_RESPONSE',
//       payload: data,
//     });
//   });

//   socketManager.on('invoke:error', async (data) => {
//     app.log.error({ clusterId: data.clusterId, requestId: data.requestId }, 'Invoke error');
//     await db.updateAgentRunStatus(data.requestId, AgentRunStatus.FAILED, null, data.error);
//     await queue.addEventProcessingJob({
//       clusterId: data.clusterId,
//       eventType: 'INVOKE_ERROR',
//       payload: data,
//     });
//   });
// };

// ============================================================================
// Request Logging Hook
// ============================================================================

app.addHook('onRequest', (request, reply, done) => {
  const traceId = (request.headers['x-trace-id'] as string) || UUID;
  const requestId = request.id as string;

  // We wrap the rest of the request lifecycle in this context
  contextManager.run({ 
    traceId, 
    requestId,
    startTime: Date.now() 
  }, () => {
    // Calling done() here means all subsequent hooks (preHandler, onResponse) 
    // and your route handler will stay inside this context.
    done();
  });
});

// ============================================================================
// Response Logging Hook
// ============================================================================

app.addHook('onResponse', (request, reply, done) => {
  // Using request.log or our global logger will now both 
  // automatically include the context metadata.
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    duration: reply.elapsedTime.toFixed(2) + 'ms',
    // You can still add specific metadata here
    userId: contextManager.getMetadata('userId') 
  }, 'request completed');
  
  done();
});

// ============================================================================
// Error Handler
// ============================================================================

app.setErrorHandler((error: any, request, reply) => {
  request.log.error(error);

  const statusCode = error.statusCode || 500;
  const errorResponse = {
    success: false,
    error: IS_PROD ? 'Internal Server Error' : error.name,
    message: error.message,
    ...(IS_PROD ? {} : { stack: error.stack }),
  };

  reply.status(statusCode).send(errorResponse);
});

// ============================================================================
// Health Check Routes
// ============================================================================

/**
 * Main health check endpoint
 * 
 * Returns overall application health status including:
 * - Database connectivity
 * - Active request count
 * - Service status
 */
app.get('/health', async (_request, reply) => {
  try {
    const hasDatabase = !!process.env.DATABASE_URL;
    let dbConnected = false;

    // Check database connectivity
    if (hasDatabase) {
      try {
        const client = await prismaManager.getClient();
        await client.$queryRaw`SELECT 1`;
        dbConnected = true;
      } catch (error) {
        app.log.warn({error}, '[Health Check] Database connection check failed');
        dbConnected = false;
      }
    }

     // Check gRPC server status
    //const grpcStatus = grpcServer?.getStats() || { isRunning: false };
     const status = (hasDatabase && dbConnected 
      // && grpcStatus.isRunning
    ) 

      ? 'healthy' 
      : 'initializing';
    return {
      status,
      services: {
        database: dbConnected ? 'connected' : hasDatabase ? 'error' : 'not configured',
       // grpc: grpcStatus.isRunning ? 'running' : 'stopped',
        // grpcConnections: grpcStatus.connections || 0
        // redis: redis ? 'connected' : 'not configured',
        // queue: queue ? 'connected' : 'not configured',
      },
      timestamp: new Date().toISOString(),
      activeRequests: prismaManager.getActiveRequestCount(),
      uptime: process.uptime(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    app.log.error({error}, '[Health Check] Health check failed');

    return reply.status(503).send({
      status: 'unhealthy',
      services: {
        database: 'error',
        grpc: 'error'
      },
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// API Routes
// ============================================================================




/**
 * Get all clusters
 * 
 * GET /api/v1/clusters
 */
app.get('/api/v1/clusters', async (request) => {
  const clusters = await request.prisma.cluster.findMany({
    select: {
      id: true,
      name: true,
      namespace: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    success: true,
    data: clusters,
  };
});

/**
 * Get cluster by ID
 * 
 * GET /api/v1/clusters/:id
 */
app.get<{ Params: { id: string } }>('/api/v1/clusters/:id', async (request, reply) => {
  const { id } = request.params;

  const cluster = await request.prisma.cluster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      namespace: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!cluster) {
    return reply.code(404).send({
      success: false,
      error: 'Cluster not found',
    });
  }

  return {
    success: true,
    data: cluster,
  };
});

/**
 * Delete cluster by ID
 * 
 * DELETE /api/v1/clusters/:id
 */
app.delete<{ Params: { id: string } }>('/api/v1/clusters/:id', async (request, reply) => {
  const { id } = request.params;

  try {
    await request.prisma.cluster.delete({
      where: { id },
    });

    return { success: true };
  } catch (error) {
    return reply.code(404).send({
      success: false,
      error: 'Cluster not found',
    });
  }
});

// app.get('/api/v1/clusters/:id/events', async (request, reply) => {
//   const { id } = request.params as any;
//   const { limit = 100, offset = 0 } = request.query as any;

//   const cluster = await db.getCluster(id);
//   if (!cluster) {
//     return reply.code(404).send({
//       success: false,
//       error: 'Cluster not found'
//     });
//   }

//   const events = await db.getClusterEvents(id, Number(limit), Number(offset));

//   return {
//     success: true,
//     data: events
//   };
// });

// app.get('/api/v1/clusters/:id/agent-runs', async (request, reply) => {
//   const { id } = request.params as any;
//   const { limit = 100 } = request.query as any;

//   const cluster = await db.getCluster(id);
//   if (!cluster) {
//     return reply.code(404).send({
//       success: false,
//       error: 'Cluster not found'
//     });
//   }

//   const runs = await db.getClusterAgentRuns(id, Number(limit));

//   return {
//     success: true,
//     data: runs
//   };
// });

// app.post('/api/v1/clusters/:id/invoke', async (request, reply) => {
//   const { id } = request.params as any;
//   const { agentName, input, parameters } = request.body as any;

//   if (!agentName || !input) {
//     return reply.code(400).send({
//       success: false,
//       error: 'Missing required fields: agentName, input'
//     });
//   }

//   const cluster = await db.getCluster(id);
//   if (!cluster) {
//     return reply.code(404).send({
//       success: false,
//       error: 'Cluster not found'
//     });
//   }

//   if (!socketManager.isClusterConnected(id)) {
//     return reply.code(503).send({
//       success: false,
//       error: 'Cluster not connected'
//     });
//   }

//   const requestId = `req_${Date.now()}_${randomBytes(4).toString('hex')}`;

//   const job = await queue.addAgentInvocationJob({
//     clusterId: id,
//     requestId,
//     agentName,
//     input,
//     parameters: parameters || {}
//   });

//   return {
//     success: true,
//     data: {
//       requestId,
//       jobId: job.id,
//       status: 'pending'
//     }
//   };
// });

// app.get('/api/v1/agent-runs/:requestId', async (request, reply) => {
//   const { requestId } = request.params as any;

//   const run = await db.getAgentRun(requestId);
//   if (!run) {
//     return reply.code(404).send({
//       success: false,
//       error: 'Agent run not found'
//     });
//   }

//   return {
//     success: true,
//     data: run
//   };
// });

// app.get('/api/v1/events', async (request) => {
//   const { limit = 100, offset = 0, type } = request.query as any;

//   const events = type
//     ? await db.getEventsByType(type as EventType, Number(limit))
//     : await db.getAllEvents(Number(limit), Number(offset));

//   return {
//     success: true,
//     data: events
//   };
// });

// app.get('/api/v1/stats', async () => {
//   const [systemStats, queueMetrics, activeClusters] = await Promise.all([
//     db.getSystemStats(),
//     queue.getAllQueueMetrics(),
//     redis.getActiveClusters(),
//   ]);

//   return {
//     success: true,
//     data: {
//       system: systemStats,
//       queues: queueMetrics,
//       activeClusters: activeClusters.length,
//     }
//   };
// });

// app.get('/api/v1/queues', async () => {
//   const metrics = await queue.getAllQueueMetrics();
//   return {
//     success: true,
//     data: metrics
//   };
// });

// app.post('/api/v1/queues/:queueName/clean', async (request, reply) => {
//   const { queueName } = request.params as any;
  
//   try {
//     const cleaned = await queue.cleanQueue(queueName as QueueName);
//     return {
//       success: true,
//       data: {
//         cleaned: cleaned.length
//       }
//     };
//   } catch (error) {
//     return reply.code(400).send({
//       success: false,
//       error: 'Invalid queue name'
//     });
//   }
// });
// ============================================================================
// Graceful Shutdown Handler
// ============================================================================

/**
 * Graceful shutdown handler.
 * 
 * **This is where ALL process signal handling happens.**
 * The database manager does NOT handle signals - only the server does.
 * 
 * Cleanup order:
 * 1. Close Fastify server (stop accepting new requests)
 * 2. Shutdown socket manager
 * 3. Shutdown queue workers
 * 4. Disconnect Redis
 * 5. Disconnect database (waits for active requests)
 */
const gracefulShutdown = closeWithGrace({ delay: 10000 }, async ({ signal, err }) => {
  if (err) {
    app.log.error({err}, '[Shutdown] Error triggered shutdown');
  }

  app.log.info(`[Shutdown] 🛑 Received ${signal}, shutting down gracefully...`);

  
  // 2. Shutdown queue workers (commented out until implemented)
    // 1. Stop gRPC server (close active streams)
  // if (grpcServer) {
  //   app.log.info('[Shutdown] Stopping gRPC server...');
  //   await grpcServer.stop();
  //   app.log.info('[Shutdown] ✓ gRPC server stopped');
  // }
  // if (queue) {
  //   app.log.info('[Shutdown] Shutting down queue workers...');
  //   await queue.shutdown();
  //   app.log.info('[Shutdown] ✓ Queue workers stopped');
  // }

  // 3. Disconnect Redis (commented out until implemented)
  // if (redis) {
  //   app.log.info('[Shutdown] Disconnecting Redis...');
  //   await redis.disconnect();
  //   app.log.info('[Shutdown] ✓ Redis disconnected');
  // }

  // 4. Disconnect database (waits for active requests)
  app.log.info('[Shutdown] Disconnecting database...');
  await prismaManager.disconnect();
  app.log.info('[Shutdown] ✓ Database disconnected');

  // 5. Close Fastify server
  app.log.info('[Shutdown] Closing Fastify server...');
  await app.close();
  app.log.info('[Shutdown] ✓ Server closed');

  app.log.info('[Shutdown] 🎉 Shutdown complete');
});

// ============================================================================
// Server Startup
// ============================================================================

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    //  Setup services
    await setupServices();

    //  Setup plugins
    await setupPlugins(app);

     // routes
  await buildApp(app)

    // Wait for Fastify to be ready
    await app.ready();

   

    // ✅ START GRPC SERVER
    app.log.info('[Server] 🔌 Starting gRPC server...');
    // grpcServer = createGrpcServer({
    //   port: GRPC_PORT,
    //   host: GRPC_HOST,
    //   tlsEnabled: GRPC_TLS_ENABLED,
    //   tlsCert: GRPC_TLS_CERT,
    //   tlsKey: GRPC_TLS_KEY,
    //   maxConnectionAge: 3600000,      // 1 hour
    //   maxConnectionIdle: 300000,       // 5 minutes
    //   keepaliveTime: 30000,            // 30 seconds
    //   keepaliveTimeout: 10000          // 10 seconds
    // });

    // await grpcServer.start();
    app.log.info('[Server] ✓ gRPC server started');

    // Start Fastify HTTP server
    await app.listen({
      port: PORT,
      host: HOST,
    });

    app.log.info(`[Server] 🚀 Server started successfully`);
    app.log.info(`[Server] 📡 Listening on http://${HOST}:${PORT}`);
   app.log.info(`[Server] 🔌 gRPC: ${GRPC_HOST}:${GRPC_PORT}`);
    app.log.info(`[Server] 🏥 Health check at http://${HOST}:${PORT}/health`);
    app.log.info(`[Server] 📊 Database health at http://${HOST}:${PORT}/health/db`);
  } catch (err) {
    app.log.error({err}, '[Server] ❌ Failed to start server');
    process.exit(1);
  }
}

// ============================================================================
// Start Application
// ============================================================================

start();

