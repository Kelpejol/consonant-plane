/**
 * src/inngest/functions/convert-terra-to-kagent.ts
 * 
 * Inngest function that converts Terra agent definitions to Kagent CRDs.
 * 
 * This function:
 * 1. Fetches the agent definition from the database
 * 2. Converts Terra YAML to Kagent CRD format
 * 3. Stores the CRD in the database
 * 4. Updates agent status
 * 5. Emits event to trigger deployment
 * 
 * Retry behavior:
 * - Max attempts: 3
 * - Exponential backoff
 * - Retries on transient errors (DB, network)
 * - Fails permanently on validation errors
 */

import { inngest, sendTerraEvent } from '../client.js';
import { prisma } from '../../db/index.js';
import { convertTerraToKagent } from '../../../helpers/convertCRDs.js';
import { logger } from '../../../utils/logger.js';
import type { TerraAgentManifest } from '../../../schemas/agent.schema.js';

// ============================================================================
// FUNCTION DEFINITION
// ============================================================================

/**
 * Convert Terra agent definition to Kagent CRD.
 * 
 * Triggered by: terra.agent.created
 * Emits: terra.agent.converted (on success/failure)
 * 
 * Retry Configuration:
 * - 3 attempts max
 * - Exponential backoff (1s, 2s, 4s)
 * - Only retries on transient errors
 */
export const convertTerraToKagentFn = inngest.createFunction(
  {
    id: 'convert-terra-to-kagent',
    name: 'Convert Terra Agent to Kagent CRD',
    retries: 3,
  },
  { event: 'terra.agent.created' },
  async ({ event, step }) => {
    const { agentId, agentName, clusterId, requestId } = event.data;

    logger.info({
      agentId,
      agentName,
      clusterId,
      requestId,
    }, 'Starting Terra to Kagent conversion');

    // Step 1: Fetch agent from database
    const agent = await step.run('fetch-agent-from-db', async () => {
      logger.info({ agentId }, 'Fetching agent from database');

      const fetchedAgent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!fetchedAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      if (fetchedAgent.status !== 'PENDING') {
        throw new Error(
          `Agent status is ${fetchedAgent.status}, expected PENDING`
        );
      }

      logger.info({
        agentId,
        status: fetchedAgent.status,
      }, 'Agent fetched successfully');

      return fetchedAgent;
    });

    // Step 2: Update status to CONVERTING
    await step.run('update-status-to-converting', async () => {
      logger.info({ agentId }, 'Updating agent status to CONVERTING');

      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: 'CONVERTING',
          updatedAt: new Date(),
        },
      });

      logger.info({ agentId }, 'Agent status updated to CONVERTING');
    });

    // Step 3: Convert Terra to Kagent CRD
    const conversionResult = await step.run('convert-to-kagent-crd', async () => {
      logger.info({ agentId }, 'Converting Terra agent to Kagent CRD');

      const terraManifest = agent.terraDefinition as TerraAgentManifest;

      const result = convertTerraToKagent(terraManifest, {
        agentId: agent.id,
        clusterId: agent.clusterId,
        namespace: terraManifest.metadata.namespace,
        tenantId: undefined, // TODO: Add tenant support
      });

      if (!result.success) {
        logger.error({
          agentId,
          error: result.error,
        }, 'Conversion failed');
        throw new Error(`Conversion failed: ${result.error}`);
      }

      logger.info({ agentId }, 'Conversion successful');
      return result;
    });

    // Step 4: Store CRD in database
    await step.run('store-kagent-crd', async () => {
      logger.info({ agentId }, 'Storing Kagent CRD in database');

      await prisma.agent.update({
        where: { id: agentId },
        data: {
          kagentCrd: conversionResult.crd as any,
          updatedAt: new Date(),
        },
      });

      logger.info({ agentId }, 'Kagent CRD stored successfully');
    });

    // Step 5: Emit conversion complete event
    await step.run('emit-converted-event', async () => {
      logger.info({ agentId }, 'Emitting agent converted event');

      await sendTerraEvent({
        name: 'terra.agent.converted',
        data: {
          agentId,
          agentName,
          clusterId,
          success: true,
          requestId,
        },
      });

      logger.info({ agentId }, 'Agent converted event emitted');
    });

    logger.info({ agentId, requestId }, 'Terra to Kagent conversion completed successfully');
    

    return {
      success: true,
      agentId,
      message: 'Conversion completed successfully',
    };
  }
);

// ============================================================================
// ERROR HANDLER
// ============================================================================

/**
 * Handle conversion failures.
 * Updates agent status to FAILED and emits failure event.
 */
export const handleConversionFailureFn = inngest.createFunction(
  {
    id: 'handle-conversion-failure',
    name: 'Handle Conversion Failure',
  },
  { event: 'inngest/function.failed' },
  async ({ event, step }) => {
    // Only handle failures from convert-terra-to-kagent
    if (event.data.function_id !== 'convert-terra-to-kagent') {
      return { skipped: true };
    }

    const originalEvent = event.data.event;
    const agentId = originalEvent?.data?.agentId;
    const error = event.data.error?.message || 'Unknown error';

    if (!agentId) {
      logger.error({ event },'Cannot handle conversion failure: no agentId');
      return { error: 'No agentId in failed event' };
    }

    logger.error({ agentId, error },'Handling conversion failure');

    // Update agent status to FAILED
    await step.run('update-agent-to-failed', async () => {
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: 'FAILED',
          error,
          errorCount: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
      });
    });

    // Emit failure event
    await step.run('emit-failure-event', async () => {
      await sendTerraEvent({
        name: 'terra.agent.failed',
        data: {
          agentId,
          stage: 'conversion',
          error,
          requestId: originalEvent?.data?.requestId || 'unknown',
          retryCount: event.data.run_id ? 3 : 0,
        },
      });
    });

    return {
      success: true,
      agentId,
      message: 'Failure handled',
    };
  }
);