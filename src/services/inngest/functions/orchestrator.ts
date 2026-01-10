/**
 * src/services/inngest/functions/orchestrator.ts
 * 
 * Inngest function for driving the Terra Orchestration Engine.
 * Handles the "orchestration loop" via durable steps.
 */

import { inngest } from '../client.js';
import { orchestrator } from '../../orchestrator/engine.js';
import { plannerClient } from '../../planner/client.js';
import { DecisionType } from '../../orchestrator/types.js';
import { prismaManager } from '../../db/index.js';

export const workflowOrchestratorFn = inngest.createFunction(
  { 
    id: 'workflow-orchestrator', 
    cancelOn: [
      { event: 'terra.workflow.state-changed', if: 'async.data.newStatus == "FAILED" || async.data.newStatus == "COMPLETED"' }
    ]
  },
  { event: 'terra.workflow.orchestration-trigger' },
  async ({ event, step, logger }) => {
    const { workflowId, traceId } = event.data;

    logger.info({ workflowId, traceId }, 'Orchestration loop triggered');

    // 1. Evaluate current state using the Core Orchestrator
    // This step is durable and retriable
    const result = await step.run('evaluate-state', async () => {
      // Ensure DB client is ready
      await prismaManager.getClient();
      return await orchestrator.runOrchestration(workflowId, traceId);
    });

    if (!result) {
      logger.info({ workflowId }, 'Orchestration yielded no result (paused or terminal)');
      return;
    }

    const { decision } = result;
    logger.info({ workflowId, decision: decision.type }, 'Handling decision');

    // 2. Act on the decision
    switch (decision.type) {
      case DecisionType.NEEDS_PLANNING:
        await step.run('handle-planning', async () => {
          logger.info({ workflowId }, 'Delegating to Planner Service');
          
          // A. Fetch goal (could pass in event, but fetching from DB/result is safer)
          // Result doesn't have goal. We rely on plannerClient fetching if needed or pass payload.
          // In my evaluator, payload had goal.
          const goal = (decision.payload as any)?.goal;
          
          if (!goal) {
            throw new Error('Goal missing in decision payload');
          }

          // B. Generate Plan (External gRPC call)
          const plan = await plannerClient.generatePlan(goal, workflowId);
          
          // C. Apply Plan (DB Update)
          await orchestrator.applyPlan(workflowId, plan, traceId);
        });

        // D. Loop: Trigger next iteration immediately to execute the plan
        await step.sendEvent('continue-orchestration', {
          name: 'terra.workflow.orchestration-trigger',
          data: {
            workflowId,
            traceId,
            trigger: 'resume'
          }
        });
        break;

      case DecisionType.GOAL_ACHIEVED:
      case DecisionType.FAILED:
        logger.info({ workflowId, status: decision.type }, 'Workflow completed');
        break;

      case DecisionType.WAIT:
        logger.info({ workflowId }, 'Workflow waiting for external event');
        // In future: await step.waitForEvent(...)
        break;
        
      default:
        logger.warn({ workflowId, type: decision.type }, 'Unhandled decision type');
    }
  }
);
