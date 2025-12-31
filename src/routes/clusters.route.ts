import type { FastifyInstance } from 'fastify';
import { createClusterController } from '../controllers/clusters.controller.js';

export async function clusterRoutes(app: FastifyInstance) {
  app.post(
    '/clusters',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'namespace'],
          properties: {
            name: { type: 'string' },
            namespace: { type: 'string' },
          },
        },
      },
    },
    createClusterController
  );
}
