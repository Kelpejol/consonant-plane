import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import closeWithGrace from 'close-with-grace';
import { createServer } from 'http';
import { SocketManager } from './services/socket/index.js';
import { prismaManager } from './services/db/manager.js';
import dbPlugin from './services/db/dbPlugin.js'
// import { RedisService } from './redis-service';
// import { QueueService, QueueName } from './queue-service';
import { randomBytes } from 'crypto';
// import { ClusterStatus, EventType, AgentRunStatus } from '@prisma/client';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/terra';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const app: FastifyInstance = Fastify({
  logger: {
    level: IS_PROD ? 'info' : 'debug',
    transport: !IS_PROD ? { target: 'pino-pretty' } : undefined,
  },
  disableRequestLogging: true,
  trustProxy: true,
});


// let redis: RedisService;
// let queue: QueueService;
let socketManager: SocketManager;

const setupServices = async () => {
  app.log.info('[Server] Initializing database...');
    await prismaManager.initialize();
    app.log.info('[Server] Database connected');

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
  await server.register(helmet);
  await server.register(cors, { 
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true 
  });
  await server.register(compress);

  // Register the plugin
await server.register(dbPlugin);
  
//   await server.register(rateLimit, {
//     max: 100,
//     timeWindow: '1 minute',
//     redis: redis.getClient(),
//   });
};

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

app.addHook('onResponse', (request, reply, done) => {
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    duration: reply.elapsedTime.toFixed(2) + 'ms'
  }, 'request completed');
  done();
});

app.setErrorHandler((error: any, request, reply) => {
  request.log.error(error);
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    success: false,
    error: IS_PROD ? 'Internal Server Error' : error.name,
    message: error.message,
  });
});

app.get('/health', async () => {
  try{
  const hasDatabase = !!process.env.DATABASE_URL;
  let dbConnected = false;
    if (hasDatabase ) {
      try {
        const prisma = await prismaManager.getClient();
        await prisma.$queryRaw`SELECT 1`;
        dbConnected = true;
      } catch {
        dbConnected = false;
      }
    }

  const status = hasDatabase  && dbConnected ? 'healthy' : 'initializing';

  return {
    status,
    services: {
      database: dbConnected ? 'connected' : 'not initialized',
    },
    timestamp: new Date().toISOString(),
    activeRequests: prismaManager.getActiveRequestCount(),
  };
}
 catch (error) {
    return {
      status: 'unhealthy',
      services: {
      database: 'error',
       },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// app.post('/api/v1/clusters', async (request, reply) => {
//   const { name, namespace } = request.body as any;

//   if (!name || !namespace) {
//     return reply.code(400).send({
//       success: false,
//       error: 'Missing required fields: name, namespace'
//     });
//   }

//   const existing = await db.getClusterByName(name);
//   if (existing) {
//     return reply.code(409).send({
//       success: false,
//       error: 'Cluster with this name already exists'
//     });
//   }

//   const token = randomBytes(64).toString('hex');
//   const cluster = await db.createCluster(name, namespace, token);

//   return {
//     success: true,
//     data: {
//       id: cluster.id,
//       name: cluster.name,
//       namespace: cluster.namespace,
//       token: cluster.token,
//       status: cluster.status
//     }
//   };
// });

// app.get('/api/v1/clusters', async () => {
//   let clusters = await redis.get('clusters:all');
  
//   if (!clusters) {
//     clusters = await db.getAllClusters();
//     await redis.set('clusters:all', clusters, 60);
//   }

//   const enriched = await Promise.all(
//     clusters.map(async (c: any) => ({
//       ...c,
//       connected: socketManager.isClusterConnected(c.id),
//       stats: await db.getClusterStats(c.id),
//     }))
//   );

//   return {
//     success: true,
//     data: enriched
//   };
// });

// app.get('/api/v1/clusters/:id', async (request, reply) => {
//   const { id } = request.params as any;
  
//   let cluster = await redis.getCachedCluster(id);
  
//   if (!cluster) {
//     cluster = await db.getCluster(id);
//     if (cluster) {
//       await redis.cacheCluster(id, cluster);
//     }
//   }

//   if (!cluster) {
//     return reply.code(404).send({
//       success: false,
//       error: 'Cluster not found'
//     });
//   }

//   const stats = await db.getClusterStats(id);

//   return {
//     success: true,
//     data: {
//       ...cluster,
//       tokenHash: undefined,
//       connected: socketManager.isClusterConnected(id),
//       stats,
//     }
//   };
// });

// app.delete('/api/v1/clusters/:id', async (request, reply) => {
//   const { id } = request.params as any;
  
//   try {
//     await db.deleteCluster(id);
//     await redis.invalidateCluster(id);
//     await redis.removeActiveConnection(id);
//     return { success: true };
//   } catch (error) {
//     return reply.code(404).send({
//       success: false,
//       error: 'Cluster not found'
//     });
//   }
// });

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

const shutdown = closeWithGrace({ delay: 10000 }, async ({ signal, err }) => {
  if (err) app.log.error(err);
  app.log.info(`[${signal}] Closing server...`);
  
//   if (socketManager) {
//     await socketManager.shutdown();
//   }
  
//   if (queue) {
//     await queue.shutdown();
//   }
  
//   if (redis) {
//     await redis.disconnect();
//   }
  
//   if (db) {
//     await db.disconnect();
//   }

 await prismaManager.disconnect();
  app.log.info('[Server] Shutdown complete');
  
  await app.close();
});

const start = async () => {
  try {
    await setupServices();
    await setupPlugins(app);

 await app.ready();

    socketManager = new SocketManager(app.log);
    socketManager.initialize(app.server, {
      path: '/socket',
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket']
    });

     await app.listen({
      port: PORT,
      host: HOST,
    });


    // setupSocketHandlers();

    // await queue.addEventCleanupJob({ daysToKeep: 30 });

    // setInterval(async () => {
    //   const inactiveClusters = await db.getInactiveClusters(10);
    //   for (const cluster of inactiveClusters) {
    //     await queue.addClusterHealthCheckJob({ clusterId: cluster.id });
    //   }
    // }, 60000);

    

    app.log.info({ port: PORT }, 'Server started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();