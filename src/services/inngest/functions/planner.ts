
import { inngest } from '../client.js';
import { logger } from '../../../utils/logger.js';

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
        // In production:
        // const plan = await plannerClient.generatePlan(goal);
        
        // Mock plan for now
        return {
          steps: [
            {
              id: 'step-1',
              description: 'Analyze codebase',
              agentSelector: 'agent:analyzer',
              dependencies: [],
              status: 'pending' as const,
            },
            {
              id: 'step-2',
              description: 'Run tests',
              agentSelector: 'agent:tester',
              dependencies: ['step-1'],
              status: 'pending' as const,
            },
          ],
          reasoning: 'Plan generated based on goal analysis',
        };
      });

      // Emit completion event back to orchestrator
      await step.sendEvent('planner-completed', {
        name: 'workflow.planner-completed',
        data: {
          workflowId: event.data.workflowId,
          plan,
          reasoning: 'Generated plan successfully',
          traceId: event.data.traceId,
        },
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