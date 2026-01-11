/**
 * @fileoverview Inngest Function Registry
 * @module services/inngest/functions/registry
 * 
 * @description
 * Central registry of all Inngest functions.
 * 
 * @author Consonant Team
 * @version 0.1.0
 */

import {
  plannerFunction
} from './planner.js';
import {
  policyEvaluatorFn,
  agentExecutorFn,
  humanApprovalRequestFn,
} from './executor.js';

// Import all function definitions
import { convertTerraToKagentFn } from './convertCRDs.js';
import { requestDeploymentFn } from './requestDeployment.js';
import { handleDeploymentConfirmationFn } from './handleDeploymentSuccess.js';
import {
  handleAgentFailureFn,
  handleInngestFunctionFailureFn,
} from './handleDeploymentFailure.js';
import { workflowOrchestratorFn } from './orchestrator.js';

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
  convertTerraToKagentFn,
  requestDeploymentFn,
  handleDeploymentConfirmationFn,
  handleAgentFailureFn,
  handleInngestFunctionFailureFn,
  workflowOrchestratorFn,
  plannerFunction,
  policyEvaluatorFn,
  agentExecutorFn,
  humanApprovalRequestFn,
] as const;

