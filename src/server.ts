import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import closeWithGrace from 'close-with-grace';
// 1. Environment & Constants
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

// 2. Logger Configuration (High Performance)
const app: FastifyInstance = Fastify({
  logger: {
    level: IS_PROD ? 'info' : 'debug',
    transport: !IS_PROD ? { target: 'pino-pretty' } : undefined,
  },
  disableRequestLogging: true, // We'll use a custom hook for cleaner logs
  trustProxy: true,
});

// 3. Plugin Registration
const setupPlugins = async (server: FastifyInstance) => {
  await server.register(helmet);
  await server.register(cors, { origin: process.env.CORS_ORIGIN || '*' });
  await server.register(compress);
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
};

// 4. Global Hooks & Error Handling
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

// 5. Health Checks
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// 6. Graceful Shutdown (Production Grade)
const shutdown = closeWithGrace({ delay: 500 }, async ({ signal, err }) => {
  if (err) app.log.error(err);
  app.log.info(`[${signal}] Closing server...`);
  await app.close();
});

// 7. Server Bootstrapping
const start = async () => {
  try {
    await setupPlugins(app);
    
    // Register your API routes here
    // await app.register(import('./routes/api'), { prefix: '/api/v1' });
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();