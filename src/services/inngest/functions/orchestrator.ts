/**
 * @fileoverview Orchestrator Inngest Function
 * @module services/inngest/functions/orchestrator
 * 
 * @description
 * Main orchestration function that processes workflow events.
 * This is the entry point for the event-driven orchestration loop.
 * 
 * @architecture
 * Event arrives → Orchestrator evaluates → Persist → Emit command → Stop
 * 
 * @author Consonant Team
 * @version 0.1.0
 */

import { inngest } from '../client.js';
import { orchestrator } from '../../orchestrator/engine.js';
import { logger } from '../../../utils/logger.js';
import { WorkflowEvent } from '@/services/orchestrator/types.js';


// ============================================================================
// EVENT MAPPING HELPER
// ============================================================================

/**
 * Map Inngest event to WorkflowEvent
 */
function mapInngestToWorkflowEvent(inngestEvent: any): WorkflowEvent {
  const { name, data } = inngestEvent;
  const timestamp = Date.now();

  // Map event name to type
  const eventTypeMap: Record<string, string> = {
    'workflow.orchestration-trigger': 'ORCHESTRATION_TRIGGER',
    'workflow.planner-completed': 'PLANNER_COMPLETED',
    'workflow.planner-failed': 'PLANNER_FAILED',
    'workflow.policy-completed': 'POLICY_COMPLETED',
    'workflow.agent-completed': 'AGENT_COMPLETED',
    'workflow.agent-failed': 'AGENT_FAILED',
    'workflow.human-approved': 'HUMAN_APPROVED',
    'workflow.human-rejected': 'HUMAN_REJECTED',
    'workflow.pause': 'PAUSE',
    'workflow.resume': 'RESUME',
    'workflow.cancel': 'CANCEL',
  };

  return {
    type: eventTypeMap[name] || 'ORCHESTRATION_TRIGGER',
    timestamp,
    ...data,
  };
}

// ============================================================================
// MAIN ORCHESTRATOR FUNCTION
// ============================================================================

/**
 * Workflow Orchestrator Function
 * 
 * @description
 * Core orchestration function that processes ALL workflow events.
 * Uses table-driven decision making for deterministic behavior.
 * 
 * **Event Flow**:
 * 1. Event arrives (any workflow event)
 * 2. Map to internal event format
 * 3. Call orchestrator.orchestrate()
 * 4. Orchestrator evaluates, persists, emits
 * 5. Function exits (wait for next event)
 * 
 * **No loops. No polling. Pure event-driven.**
 */
/**
 * Workflow Lifecycle Function
 * Handles: trigger, pause, resume, cancel, human-approved, human-rejected
 */
export const workflowLifecycleFn = inngest.createFunction(
  {
    id: 'workflow-lifecycle',
    name: 'Workflow Lifecycle',
    retries: 3,
  },
  [
    { event: 'workflow.orchestration-trigger' },
    { event: 'workflow.human-approved' },
    { event: 'workflow.human-rejected' },
    { event: 'workflow.pause' },
    { event: 'workflow.resume' },
    { event: 'workflow.cancel' },
  ],
  async ({ event, step }) => {
    const { workflowId, traceId } = event.data;
    logger.info({ workflowId, traceId, eventType: event.name }, '[Orchestrator Lifecycle] Event received');

    const result = await step.run('orchestrate', async () => {
      const workflowEvent = mapInngestToWorkflowEvent(event);
      return await orchestrator.orchestrate(workflowId, workflowEvent);
    });

    return handleOrchestrationResult(result);
  }
);

/**
 * Workflow Execution Function
 * Handles: planner-completed, planner-failed, policy-completed, agent-completed, agent-failed
 */
export const workflowExecutionFn = inngest.createFunction(
  {
    id: 'workflow-execution',
    name: 'Workflow Execution',
    retries: 3,
  },
  [
    { event: 'workflow.planner-completed' },
    { event: 'workflow.planner-failed' },
    { event: 'workflow.policy-completed' },
    { event: 'workflow.agent-completed' },
    { event: 'workflow.agent-failed' },
  ],
  async ({ event, step }) => {
    const { workflowId, traceId } = event.data;
    logger.info({ workflowId, traceId, eventType: event.name }, '[Orchestrator Execution] Event received');

    const result = await step.run('orchestrate', async () => {
      const workflowEvent = mapInngestToWorkflowEvent(event);
      return await orchestrator.orchestrate(workflowId, workflowEvent);
    });

    return handleOrchestrationResult(result);
  }
);

/**
 * Common result handler for orchestration functions
 */
function handleOrchestrationResult(result: any) {
  if (!result) {
    return { skipped: true, reason: 'Workflow paused or terminal' };
  }

  return {
    success: true,
    workflowId: result.workflowId,
    decision: result.decision.type,
    newStatus: result.newStatus,
    commandEmitted: !!result.command,
    timestamp: result.timestamp,
  };
}

