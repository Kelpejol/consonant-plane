/**
 * gRPC client stub for communicating with mediator.
 * This is a placeholder - actual implementation depends on mediator API.
 */

import { logger } from '../../utils/logger.js';
import type { KagentCRD } from '../../types/agentManifest.js';

export interface MediatorDeploymentResult {
  success: boolean;
  deploymentId?: string;
  error?: string;
}

/**
 * Send Kagent CRD to mediator for deployment.
 * 
 * TODO: Implement actual gRPC client when mediator API is ready.
 */
export async function sendKagentCRDToMediator(
  crd: KagentCRD,
  clusterId: string
): Promise<MediatorDeploymentResult> {
  logger.info( {
    agentName: crd.metadata.name,
    clusterId,
    namespace: crd.metadata.namespace,
  }, 'Sending Kagent CRD to mediator (STUB)');

  // TODO: Replace with actual gRPC call
  // const client = getMediatorGrpcClient();
  // const result = await client.DeployAgent({ crd, clusterId });

  // Simulate deployment
  await new Promise(resolve => setTimeout(resolve, 1000));

  const deploymentId = `deploy-${Date.now()}`;

  logger.info({
    agentName: crd.metadata.name,
    deploymentId,
  },'Kagent CRD sent to mediator (STUB)');

  return {
    success: true,
    deploymentId,
  };
}