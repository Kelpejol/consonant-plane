/**
 * Inngest function for deploying Kagent agents to clusters via mediator.
 */

import { inngest, sendTerraEvent } from '../client.js';
import { prisma } from '../../../services/db/index.js';
import { sendKagentCRDToMediator } from '../../grpc/client.js';
import { logger } from '../../../utils/logger.js';

export const deployKagentAgentFn = inngest.createFunction(
  {
    id: 'deploy-kagent-agent',
    name: 'Deploy Kagent Agent to Cluster',
    retries: 3,
  },
  { event: 'terra.agent.converted' },
  async ({ event, step }) => {
    const { agentId, clusterId, requestId } = event.data;

    if (!event.data.success) {
      logger.warn({ agentId }, 'Skipping deployment - conversion failed');
      return { skipped: true, reason: 'Conversion failed' };
    }

    // Step 1: Fetch agent and CRD
    const agent = await step.run('fetch-agent-crd', async () => {
      const fetchedAgent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!fetchedAgent || !fetchedAgent.kagentCrd) {
        throw new Error(`Agent or CRD not found: ${agentId}`);
      }

      return fetchedAgent;
    });

    // Step 2: Update status to DEPLOYING
    await step.run('update-status-deploying', async () => {
      await prisma.agent.update({
        where: { id: agentId },
        data: { status: 'DEPLOYING' },
      });
    });

    // Step 3: Send to mediator via gRPC
    const deploymentResult = await step.run('send-to-mediator', async () => {
      const result = await sendKagentCRDToMediator(
        agent.kagentCrd as any,
        clusterId
      );

      if (!result.success) {
        throw new Error(`Deployment failed: ${result.error}`);
      }

      return result;
    });

    // Step 4: Update agent to ACTIVE
    await step.run('update-status-active', async () => {
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: 'ACTIVE',
          deploymentId: deploymentResult.deploymentId,
          deployedAt: new Date(),
        },
      });
    });

    // Step 5: Emit deployed event
    await step.run('emit-deployed-event', async () => {
      await sendTerraEvent({
        name: 'terra.agent.deployed',
        data: {
          agentId,
          clusterId,
          success: true,
          deploymentId: deploymentResult.deploymentId,
          requestId,
          deployedAt: new Date().toISOString(),
        },
      });
    });

    return { success: true, agentId, deploymentId: deploymentResult.deploymentId };
  }
);