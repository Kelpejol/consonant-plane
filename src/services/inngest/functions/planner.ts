
import { inngest } from '../client.js';
import { logger } from '../../../utils/logger.js';
import { plannerClient } from '@/proto/planner.js';

// ============================================================================
// PLANNER FUNCTION
// ============================================================================

/**
 * Planner execution function
 * 
 * Listens to: workflow.planner-generate
 * Emits: workflow.planner-completed | workflow.planner-failed
 */
export const plannerFunction = inngest.createFunction(
  { id: 'planner-generate', name: 'Plan Generator' },
  { event: 'workflow.planner-generate' },
  async ({ event, step }) => {
    const { workflowId, goal, traceId } = event.data;

    logger.info({ workflowId, traceId }, '[Planner] Starting plan generation');

    try {
      // TODO: Replace with actual LangGraph planner call
      // For now, generate a simple mock plan
      
      const plan = await step.run('generate-plan', async () => {
        
        const plan = await plannerClient.generatePlan(goal, workflowId);
            
        return plan;
      });

      return { success: true, plan };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Emit failure event
      await step.sendEvent('emit-planner-failed', {
        name: 'workflow.planner-failed',
        data: {
          workflowId: event.data.workflowId,
          error: errorMessage,
          retryable: true,
          traceId: event.data.traceId,
        },
      });

      throw error;
    }
  }
);