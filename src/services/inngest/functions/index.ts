/**
 * src/inngest/functions/index.ts
 * 
 * Central export for all Inngest functions.
 * 
 * Each function is a separate worker with a single responsibility:
 * 
 * 1. validate-agent: Validate Terra agent manifest (optional, validation is sync in API)
 * 2. convert-terra-to-kagent: Convert Terra → Kagent CRD
 * 3. request-deployment: Send deployment request to mediator
 * 4. handle-deployment-confirmation: Process mediator deployment callback
 * 5. handle-failure: Handle agent failures and update status
 * 
 * Event Flow:
 * 
 * terra.agent.created
 *   ↓
 * [convert-terra-to-kagent]
 *   ↓
 * terra.agent.converted
 *   ↓
 * [request-deployment]
 *   ↓
 * terra.agent.deployment-requested
 *   ↓
 * (wait for mediator callback)
 *   ↓
 * terra.agent.deployed
 *   ↓
 * [handle-deployment-confirmation]
 *   ↓
 * Agent status: ACTIVE
 * 
 * On failure at any stage:
 *   ↓
 * terra.agent.failed or inngest/function.failed
 *   ↓
 * [handle-failure]
 *   ↓
 * Agent status: FAILED
 */


// Import all function definitions
export { convertTerraToKagentFn } from './convertCRDs.js';
export { requestDeploymentFn } from './requestDeployment.js';
export { handleDeploymentConfirmationFn } from './handleDeploymentSuccess.js';
export {
  handleAgentFailureFn,
  handleInngestFunctionFailureFn,
} from './handleDeploymentFailure.js';

/**
 * Array of all functions for easy registration with Inngest.
 * 
 * Usage in server.ts:
 * ```typescript
 * import { serve } from 'inngest/fastify';
 * import { inngest } from './inngest/client.js';
 * import * as inngestFunctions from './inngest/functions/index.js';
 * 
 * app.all('/api/inngest', serve({
 *   client: inngest,
 *   functions: Object.values(inngestFunctions),
 * }));
 * ```
 */
export const allFunctions = [
  // Don't include validateAgentFn since validation is synchronous in API
  // validateAgentFn,
  
] as const;