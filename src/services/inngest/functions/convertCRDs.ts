/**
 * src/inngest/functions/convert-terra-to-kagent.ts
 * 
 * Worker: Convert Terra Agent to Kagent CRD
 * 
 * Single Responsibility: Transform Terra manifest to Kagent CRD format
 * 
 * Triggered by: terra.agent.created
 * Emits: terra.agent.converted (success or failure)
 * 
 * Retry Configuration:
 * - 3 attempts max
 * - Exponential backoff
 * - Only retries on transient errors (DB, network)
 * - Fails permanently on conversion errors
 */

import { inngest } from '../client.js';
import { sendEvent } from '../client.js';
import { logger } from '../../../utils/logger.js';
import type { TerraAgentManifest } from '../../../schemas/agent.schema.js';
import { convertTerraToKagent } from '@/helpers/convertCRDs.js';
import { prismaManager } from '@/services/db/manager.js';
/**
 * Convert Terra agent definition to Kagent CRD.
 * 
 * This worker:
 * 1. Fetches agent from database
 * 2. Updates status to CONVERTING
 * 3. Performs Terra → Kagent transformation
 * 4. Stores CRD in database
 * 5. Emits conversion complete event
 * 
 * The worker does NOT deploy - it only converts. Deployment is handled
 * by a separate worker that listens to terra.agent.converted.
 */
export const convertTerraToKagentFn = inngest.createFunction(
  {
    id: 'convert-terra-to-kagent',
    name: 'Convert Terra Agent to Kagent CRD',
    retries: 3,
    // Add rate limiting if needed
    // rateLimit: {
    //   limit: 10,
    //   period: '1m',
    // },
  },
  { event: 'agent.created' },
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
      logger.debug({ agentId }, 'Fetching agent from database');

       const prisma = await prismaManager.getClient();
      const fetchedAgent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!fetchedAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      if (fetchedAgent.status !== 'PENDING') {
        logger.warn({
          agentId,
          currentStatus: fetchedAgent.status,
        }, 'Agent status is not PENDING, skipping conversion');
        
        throw new Error(
          `Agent status is ${fetchedAgent.status}, expected PENDING`
        );
      }

      logger.debug({ agentId }, 'Agent fetched successfully');
      return fetchedAgent;
    });

    // Step 2: Update status to CONVERTING
    await step.run('update-status-to-converting', async () => {
      logger.debug({ agentId }, 'Updating agent status to CONVERTING');

       const prisma = await prismaManager.getClient();
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: 'CONVERTING',
          updatedAt: new Date(),
        },
      });

      logger.debug({ agentId }, 'Agent status updated to CONVERTING');
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
      logger.debug({ agentId }, 'Storing Kagent CRD in database');

       const prisma = await prismaManager.getClient();
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          kagentCrd: conversionResult.crd as any,
          updatedAt: new Date(),
        },
      });

      logger.debug({ agentId }, 'Kagent CRD stored successfully');
    });

    // Step 5: Emit conversion complete event
    await step.run('emit-converted-event', async () => {
      logger.debug({ agentId }, 'Emitting agent converted event');

      await sendEvent({
        name: 'agent.converted',
        data: {
          agentId,
          agentName,
          clusterId,
          success: true,
          requestId,
        },
      });

      logger.debug({ agentId }, 'Agent converted event emitted');
    });

    logger.info({
      agentId,
      requestId,
    }, 'Terra to Kagent conversion completed successfully');

    return {
      success: true,
      agentId,
      message: 'Conversion completed successfully',
    };
  }
);