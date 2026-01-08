/**
 * src/inngest/functions/handle-failure.ts
 * 
 * Worker: Handle Agent Failure
 * 
 * Single Responsibility: Update agent status and create audit trail when failures occur
 * 
 * Triggered by:
 * - terra.agent.failed
 * - inngest/function.failed (for any agent-related function)
 * 
 * This worker centralizes failure handling to ensure consistent
 * error tracking and status updates across all agent lifecycle stages.
 * 
 * Retry Configuration:
 * - 3 attempts for database updates
 * - Exponential backoff
 */

import { inngest } from '../client.js';
import { prisma } from '../../db/index.js';
import { sendEvent } from '../client.js';
import { logger } from '../../../utils/logger.js';

/**
 * Handle agent failure from terra.agent.failed events.
 * 
 * This worker:
 * 1. Updates agent status to FAILED
 * 2. Stores error message and increments error count
 * 3. Creates event record for audit trail
 * 4. Emits status-updated event
 */
export const handleAgentFailureFn = inngest.createFunction(
  {
    id: 'handle-agent-failure',
    name: 'Handle Agent Failure',
    retries: 3,
  },
  { event: 'terra.agent.failed' },
  async ({ event, step }) => {
    const { agentId, stage, error, stackTrace, requestId, retryCount } =
      event.data;

    logger.error({
      agentId,
      stage,
      error,
      retryCount,
      requestId,
    }, 'Handling agent failure');

    // Step 1: Fetch current agent state
    const agent = await step.run('fetch-agent', async () => {
      const fetchedAgent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!fetchedAgent) {
        logger.warn({ agentId }, 'Agent not found, cannot update failure status');
        return null;
      }

      return fetchedAgent;
    });

    if (!agent) {
      return {
        success: false,
        reason: 'Agent not found',
      };
    }

    const previousStatus = agent.status;

    // Step 2: Update agent to FAILED status
    await step.run('update-agent-to-failed', async () => {
      logger.debug({
        agentId,
        stage,
      }, 'Updating agent status to FAILED');

      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: 'FAILED',
          error: `${stage}: ${error}`,
          errorCount: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
      });

      logger.debug({ agentId }, 'Agent status updated to FAILED');
    });

    // Step 3: Create event record for audit trail
    await step.run('create-failure-event', async () => {
      logger.debug({ agentId }, 'Creating failure event record');

      await prisma.event.create({
        data: {
          type: 'AGENT_FAILED',
          agentId,
          clusterId: agent.clusterId,
          payload: {
            stage,
            error,
            stackTrace,
            requestId,
            retryCount,
          },
          // severity: 'error',
          // source: 'terra-platform',
        },
      });

      logger.debug({ agentId }, 'Failure event record created');
    });

    // Step 4: Emit status-updated event
    await step.run('emit-status-updated-event', async () => {
      logger.debug({ agentId }, 'Emitting status-updated event');

      await sendEvent({
        name: 'terra.agent.status-updated',
        data: {
          agentId,
          previousStatus,
          newStatus: 'FAILED',
          reason: `Failed at ${stage}: ${error}`,
          timestamp: new Date().toISOString(),
        },
      });

      logger.debug({ agentId }, 'Status-updated event emitted');
    });

    logger.error({
      agentId,
      stage,
      requestId,
    }, 'Agent failure handled successfully');

    return {
      success: true,
      agentId,
      finalStatus: 'FAILED',
    };
  }
);

/**
 * Handle Inngest function failures.
 * 
 * This worker listens to inngest/function.failed events and
 * converts them into terra.agent.failed events for consistent handling.
 */
export const handleInngestFunctionFailureFn = inngest.createFunction(
  {
    id: 'handle-inngest-function-failure',
    name: 'Handle Inngest Function Failure',
    retries: 3,
  },
  { event: 'inngest/function.failed' },
  async ({ event, step }) => {
    const { function_id, error, event: originalEvent } = event.data;

    // Only handle agent-related function failures
    const agentFunctions = [
      'convert-terra-to-kagent',
      'request-deployment',
      'handle-deployment-confirmation',
    ];

    if (!agentFunctions.includes(function_id)) {
      logger.debug({
        functionId: function_id,
      }, 'Skipping non-agent function failure');
      
      return { skipped: true, reason: 'Not an agent function' };
    }

    const agentId = originalEvent?.data?.agentId;
    const requestId = originalEvent?.data?.requestId || 'unknown';

    if (!agentId) {
      logger.warn({
        functionId: function_id,
        event: originalEvent,
      }, 'Cannot handle function failure: no agentId in event');
      
      return { skipped: true, reason: 'No agentId in event' };
    }

    logger.error({
      agentId,
      functionId: function_id,
      error: error?.message,
      requestId,
    }, 'Handling Inngest function failure');

    // Map function ID to stage
    const stageMap: Record<string, 'validation' | 'conversion' | 'deployment'> = {
      'convert-terra-to-kagent': 'conversion',
      'request-deployment': 'deployment',
      'handle-deployment-confirmation': 'deployment',
    };

    const stage = stageMap[function_id] || 'conversion';

    // Emit terra.agent.failed event
    await step.run('emit-agent-failed-event', async () => {
      await sendEvent({
        name: 'terra.agent.failed',
        data: {
          agentId,
          stage,
          error: error?.message || 'Function failed',
          stackTrace: error?.stack,
          requestId,
          retryCount: 3, // Max retries reached
        },
      });
    });

    logger.info({
      agentId,
      functionId: function_id,
      requestId,
    }, 'Inngest function failure converted to agent failure event');

    return {
      success: true,
      agentId,
      convertedToAgentFailure: true,
    };
  }
);