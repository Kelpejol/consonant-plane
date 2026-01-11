/**
 * src/inngest/functions/handle-deployment-confirmation.ts
 * 
 * Worker: Handle Deployment Confirmation
 * 
 * Single Responsibility: Update agent status when mediator confirms deployment
 * 
 * Triggered by: terra.agent.deployed (from mediator callback)
 * Emits: terra.agent.status-updated
 * 
 * This worker handles the response from the mediator after deployment.
 * It updates the agent status to ACTIVE (success) or FAILED (failure).
 * 
 * Flow:
 * 1. Mediator deploys agent to Kagent
 * 2. Mediator sends callback → terra.agent.deployed event
 * 3. This worker updates agent status accordingly
 * 
 * Retry Configuration:
 * - 3 attempts for database updates
 * - Exponential backoff
 */

import { inngest } from '../client.js';
import { sendEvent } from '../client.js';
import { logger } from '../../../utils/logger.js';
import { prismaManager } from '@/services/db/manager.js';

/**
 * Handle deployment confirmation from mediator.
 * 
 * This worker:
 * 1. Checks if deployment was successful
 * 2. Updates agent status to ACTIVE or FAILED
 * 3. Stores deployment metadata
 * 4. Emits status-updated event
 */
export const handleDeploymentConfirmationFn = inngest.createFunction(
  {
    id: 'handle-deployment-confirmation',
    name: 'Handle Deployment Confirmation from Mediator',
    retries: 3,
  },
  { event: 'agent.deployed' },
  async ({ event, step }) => {
    const {
      agentId,
      clusterId,
      success,
      deploymentId,
      error,
      requestId,
      deployedAt,
    } = event.data;

    logger.info({
      agentId,
      clusterId,
      success,
      deploymentId,
      requestId,
    }, 'Handling deployment confirmation');

    // Step 1: Fetch current agent state
    const agent = await step.run('fetch-agent', async () => {
      logger.debug({ agentId }, 'Fetching agent from database');

            const prisma = await prismaManager.getClient();
    
      const fetchedAgent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!fetchedAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      logger.debug({
        agentId,
        currentStatus: fetchedAgent.status,
      }, 'Agent fetched successfully');

      return fetchedAgent;
    });

    const previousStatus = agent.status;

    // Step 2: Update agent status based on deployment result
    if (success) {
      await step.run('update-status-to-active', async () => {
        logger.info({
          agentId,
          deploymentId,
        }, 'Updating agent status to ACTIVE');

         const prisma = await prismaManager.getClient();
        await prisma.agent.update({
          where: { id: agentId },
          data: {
            status: 'ACTIVE',
            deploymentId: deploymentId || agent.deploymentId,
            deployedAt: new Date(deployedAt),
            error: null, // Clear any previous errors
            updatedAt: new Date(),
          },
        });

        logger.info({
          agentId,
          deploymentId,
        }, 'Agent status updated to ACTIVE');
      });
    } else {
      await step.run('update-status-to-failed', async () => {
        logger.error({
          agentId,
          error,
        }, 'Updating agent status to FAILED');

         const prisma = await prismaManager.getClient();
        await prisma.agent.update({
          where: { id: agentId },
          data: {
            status: 'FAILED',
            error: error || 'Deployment failed',
            errorCount: {
              increment: 1,
            },
            updatedAt: new Date(),
          },
        });

        logger.error({
          agentId,
          error,
        }, 'Agent status updated to FAILED');
      });
    }

    // Step 3: Emit status-updated event
    await step.run('emit-status-updated-event', async () => {
      logger.debug({ agentId }, 'Emitting status-updated event');

      await sendEvent({
        name: 'agent.status-updated',
        data: {
          agentId,
          previousStatus,
          newStatus: success ? 'ACTIVE' : 'FAILED',
          reason: success
            ? 'Deployment confirmed by mediator'
            : `Deployment failed: ${error}`,
          timestamp: new Date().toISOString(),
        },
      });

      logger.debug({ agentId }, 'Status-updated event emitted');
    });

    // Step 4: Create event record for audit trail
    await step.run('create-event-record', async () => {
      logger.debug({ agentId }, 'Creating event record');
     
      const prisma = await prismaManager.getClient();
      await prisma.event.create({
        data: {
          type: success ? 'AGENT_DEPLOYED' : 'AGENT_FAILED',
          agentId,
          clusterId,
          payload: {
            deploymentId,
            error,
            requestId,
            deployedAt,
          },
          // severity: success ? 'info' : 'error',
          // source: 'mediator',
        },
      });

      logger.debug({ agentId }, 'Event record created');
    });

    logger.info({
      agentId,
      success,
      newStatus: success ? 'ACTIVE' : 'FAILED',
      requestId,
    }, 'Deployment confirmation handled successfully');

    return {
      success: true,
      agentId,
      finalStatus: success ? 'ACTIVE' : 'FAILED',
    };
  }
);