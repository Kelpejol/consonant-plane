/**
 * src/inngest/functions/request-deployment.ts
 * 
 * Worker: Request Agent Deployment
 * 
 * Single Responsibility: Send deployment request to mediator via gRPC
 * 
 * Triggered by: terra.agent.converted (when success: true)
 * Emits: terra.agent.deployment-requested
 * 
 * This worker ONLY sends the deployment request to the mediator.
 * It does NOT update the agent status to ACTIVE.
 * 
 * Status updates happen in response to callbacks from the mediator:
 * - When mediator confirms deployment → terra.agent.deployed event
 * - When that event arrives → update-agent-status worker handles it
 * 
 * Retry Configuration:
 * - 3 attempts for sending to mediator
 * - Exponential backoff
 * - Retries on network/transient errors
 */

import { inngest } from '../client.js';
import { sendEvent } from '../client.js';
import { logger } from '../../../utils/logger.js';
import { sendKagentCRDToMediator } from '@/services/grpc/client.js';
import { prismaManager } from '@/services/db/manager.js';

/**
 * Request deployment of agent to cluster via mediator.
 * 
 * This worker:
 * 1. Checks conversion was successful
 * 2. Fetches agent and CRD from database
 * 3. Updates status to DEPLOYING
 * 4. Sends CRD to mediator via gRPC
 * 5. Emits deployment-requested event
 * 
 * Note: This does NOT set status to ACTIVE. That happens later
 * when mediator confirms successful deployment.
 */
export const requestDeploymentFn = inngest.createFunction(
  {
    id: 'request-deployment',
    name: 'Request Agent Deployment to Cluster',
    retries: 3,
  },
  { event: 'agent.converted' },
  async ({ event, step }) => {
    const { agentId, clusterId, requestId, success } = event.data;

    // Don't proceed if conversion failed
    if (!success) {
      logger.warn({
        agentId,
        requestId,
      }, 'Skipping deployment request - conversion failed');
      
      return {
        skipped: true,
        reason: 'Conversion failed',
      };
    }

    logger.info({
      agentId,
      clusterId,
      requestId,
    }, 'Starting deployment request');

    // Step 1: Fetch agent and validate CRD exists
    const agent = await step.run('fetch-agent-and-crd', async () => {
      logger.debug({ agentId }, 'Fetching agent and CRD from database');

       const prisma = await prismaManager.getClient();
      const fetchedAgent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!fetchedAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      if (!fetchedAgent.kagentCrd) {
        throw new Error(`Agent CRD not found: ${agentId}`);
      }

      logger.debug({ agentId }, 'Agent and CRD fetched successfully');
      return fetchedAgent;
    });

    // Step 2: Update status to DEPLOYING
    await step.run('update-status-to-deploying', async () => {
      logger.debug({ agentId }, 'Updating agent status to DEPLOYING');

       const prisma = await prismaManager.getClient();
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: 'DEPLOYING',
          updatedAt: new Date(),
        },
      });

      logger.debug({ agentId }, 'Agent status updated to DEPLOYING');
    });

    // Step 3: Send to mediator via gRPC
    const mediatorResult = await step.run('send-to-mediator', async () => {
      logger.info({
        agentId,
        clusterId,
      }, 'Sending CRD to mediator via gRPC');

      const crd = agent.kagentCrd as any;
      
      const result = await sendKagentCRDToMediator(crd, clusterId);

      if (!result.success) {
        logger.error({
          agentId,
          clusterId,
          error: result.error,
        }, 'Mediator request failed');
        
        throw new Error(`Mediator request failed: ${result.error}`);
      }

      logger.info({
        agentId,
        clusterId,
        deploymentId: result.deploymentId,
      }, 'CRD sent to mediator successfully');

      return result;
    });

    // Step 4: Store deployment ID (tracking purposes)
    await step.run('store-deployment-id', async () => {
      if (mediatorResult.deploymentId) {
        logger.debug({
          agentId,
          deploymentId: mediatorResult.deploymentId,
        }, 'Storing deployment ID');

         const prisma = await prismaManager.getClient();
        await prisma.agent.update({
          where: { id: agentId },
          data: {
            deploymentId: mediatorResult.deploymentId,
            updatedAt: new Date(),
          },
        });
      }
    });

    // Step 5: Emit deployment-requested event
    await step.run('emit-deployment-requested-event', async () => {
      logger.debug({ agentId }, 'Emitting deployment-requested event');

      await sendEvent({
        name: 'agent.deployment-requested',
        data: {
          agentId,
          clusterId,
          requestId,
        },
      });

      logger.debug({ agentId }, 'Deployment-requested event emitted');
    });

    logger.info({
      agentId,
      clusterId,
      deploymentId: mediatorResult.deploymentId,
      requestId,
    }, 'Deployment request completed successfully');

    return {
      success: true,
      agentId,
      deploymentId: mediatorResult.deploymentId,
      message: 'Deployment request sent to mediator',
    };
  }
);