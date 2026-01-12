/**
 * @fileoverview Decision Functions for Workflow Orchestration
 * @module orchestrator/decisions
 * 
 * @description
 * Pure functions that return Decision objects.
 * Decision functions are the ONLY place where next state is determined.
 * 
 * @principles
 * - Decision functions are pure: (context) => Decision
 * - Decision functions never mutate state
 * - Decision functions never cause side effects
 * - Decision functions never call other decision functions
 * - All branching is in guards, not here
 * 
 * @example
 * ```typescript
 * function decideNeedsPlanning(ctx: EvalContext): Decision {
 *   return {
 *     type: 'EMIT_COMMAND',
 *     nextStatus: 'WAITING_ON_PLANNER',
 *     command: { type: 'planner.generate', payload: { goal: ctx.state.goal } },
 *     reason: 'New workflow requires planning'
 *   };
 * }
 * ```
 * 
 * @author Terra Infrastructure Team
 * @version 2.0.0 (Table-Driven)
 */

import type {
  EvalContext,
  Decision,
  EmitCommandDecision,
  PlannerCompletedEvent,
  PolicyCompletedEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  PlannerFailedEvent,
} from './types.js';
import { emitCommandDecision, fail, complete, noop, pause } from './types.js';

// ============================================================================
// PLANNING DECISIONS
// ============================================================================

/**
 * Workflow needs plan generation
 * 
 * Emits: planner.generate command
 * Next Status: WAITING_ON_PLANNER
 */
export function decideNeedsPlanning(ctx: EvalContext): EmitCommandDecision {
  return emitCommandDecision(
    'WAITING_ON_PLANNER',
    {
      type: 'workflow.planner-generate',
      payload: {
        goal: ctx.state.goal,
        traceId: ctx.state.traceId,
      },
    },
    'New workflow requires planning'
  );
}

/**
 * Plan generation completed successfully
 * 
 * Emits: policy.evaluate command (if needed)
 * Next Status: WAITING_ON_POLICY
 */
export function decideApplyPlan(ctx: EvalContext): EmitCommandDecision {
  const event = ctx.event as PlannerCompletedEvent;

  return emitCommandDecision(
    'WAITING_ON_POLICY',
    {
      type: 'workflow.policy-evaluate',
      payload: {
        workflowId: ctx.state.id,
        plan: event.plan,
        traceId: ctx.state.traceId,
      },
    },
    'Plan generated, evaluating policy compliance'
  );
}

/**
 * Plan generation failed (retryable)
 * 
 * Next Status: Back to CREATED for retry
 */
export function decidePlannerFailureRetry(ctx: EvalContext): Decision {
  const event = ctx.event as PlannerFailedEvent;

  if (!event.retryable || ctx.facts.retriesExhausted) {
    return fail(`Planner failed: ${event.error}`);
  }

  return emitCommandDecision(
    'CREATED',
    {
      type: 'workflow.planner-generate',
      payload: {
        goal: ctx.state.goal,
        retryCount: ctx.state.state.retryCount,
      },
    },
    `Retrying plan generation (attempt ${ctx.state.state.retryCount + 1})`
  );
}

/**
 * Plan generation failed permanently
 */
export function decidePlannerFailure(ctx: EvalContext): Decision {
  const event = ctx.event as PlannerFailedEvent;
  return fail(`Plan generation failed: ${event.error}`);
}

// ============================================================================
// POLICY DECISIONS
// ============================================================================

/**
 * Policy evaluation completed
 * 
 * Three possible outcomes:
 * - passed: Proceed to agent execution
 * - needs_approval: Escalate to human
 * - failed: Fail workflow
 */
export function decidePolicyApproved(ctx: EvalContext): Decision {
  const event = ctx.event as PolicyCompletedEvent;

  switch (event.result) {
    case 'passed':
      // Policy passed - proceed to execution
      return emitCommandDecision(
        'WAITING_ON_AGENT',
        {
          type: 'workflow.agent-execute',
          payload: {
            workflowId: ctx.state.id,
            plan: ctx.state.plan?.plan,
            stepIndex: ctx.facts.currentStepIndex,
            traceId: ctx.state.traceId,
          },
        },
        'Policy approved, starting execution'
      );

    case 'needs_approval':
      // Policy requires human approval
      return decideNeedsHumanApproval(ctx);

    case 'failed':
      // Policy failed - terminate workflow
      const violations = event.violations?.join(', ') || 'Unknown violations';
      return fail(`Policy check failed: ${violations}`);
  }
}

/**
 * Policy evaluation requires human approval
 * 
 * Emits: human.request-approval command
 * Next Status: WAITING_ON_HUMAN
 */
export function decideNeedsHumanApproval(ctx: EvalContext): EmitCommandDecision {
  return emitCommandDecision(
    'WAITING_ON_HUMAN',
    {
      type: 'workflow.human-request-approval',
      payload: {
        workflowId: ctx.state.id,
        plan: ctx.state.plan?.plan,
        reason: 'Policy requires manual approval',
        traceId: ctx.state.traceId,
      },
    },
    'Policy requires human approval'
  );
}

// ============================================================================
// AGENT EXECUTION DECISIONS
// ============================================================================

/**
 * Execute next step in plan
 * 
 * Emits: agent.execute command
 * Next Status: WAITING_ON_AGENT
 */
export function decideExecuteNextStep(ctx: EvalContext): EmitCommandDecision {
  return emitCommandDecision(
    'WAITING_ON_AGENT',
    {
      type: 'workflow.agent-execute',
      payload: {
        workflowId: ctx.state.id,
        plan: ctx.state.plan?.plan,
        stepIndex: ctx.facts.currentStepIndex,
        traceId: ctx.state.traceId,
      },
    },
    `Executing step ${ctx.facts.currentStepIndex + 1} of ${ctx.facts.totalSteps}`
  );
}

/**
 * Agent execution completed successfully
 * 
 * Decision depends on remaining steps:
 * - If more steps: continue to next step
 * - If all done: complete workflow
 */
export function decideAgentCompleted(ctx: EvalContext): Decision {
  const event = ctx.event as AgentCompletedEvent;

  // Check if all steps are completed
  if (ctx.facts.allStepsCompleted) {
    return complete('All workflow steps completed successfully');
  }

  // Continue to next step
  return emitCommandDecision(
    'WAITING_ON_AGENT',
    {
      type: 'workflow.agent-execute',
      payload: {
        workflowId: ctx.state.id,
        plan: ctx.state.plan?.plan,
        stepIndex: ctx.facts.currentStepIndex + 1,
        lastResult: event.result,
        traceId: ctx.state.traceId,
      },
    },
    `Step completed, executing next step`
  );
}

/**
 * Agent execution failed (retryable)
 * 
 * Emits: agent.execute command (retry same step)
 * Next Status: WAITING_ON_AGENT
 */
export function decideAgentFailureRetry(ctx: EvalContext): Decision {
  const event = ctx.event as AgentFailedEvent;

  if (!event.retryable || ctx.facts.retriesExhausted) {
    return fail(`Agent execution failed: ${event.error}`);
  }

  return emitCommandDecision(
    'WAITING_ON_AGENT',
    {
      type: 'workflow.agent-execute',
      payload: {
        workflowId: ctx.state.id,
        plan: ctx.state.plan?.plan,
        stepIndex: ctx.facts.currentStepIndex,
        retryCount: ctx.state.state.retryCount,
        traceId: ctx.state.traceId,
      },
    },
    `Retrying agent execution (attempt ${ctx.state.state.retryCount + 1})`
  );
}

/**
 * Agent execution failed permanently
 */
export function decideAgentFailure(ctx: EvalContext): Decision {
  const event = ctx.event as AgentFailedEvent;
  return fail(`Agent execution failed: ${event.error}`);
}

// ============================================================================
// HUMAN APPROVAL DECISIONS
// ============================================================================

/**
 * Human approved workflow
 * 
 * Emits: agent.execute command
 * Next Status: WAITING_ON_AGENT
 */
export function decideHumanApproved(ctx: EvalContext): EmitCommandDecision {
  return emitCommandDecision(
    'WAITING_ON_AGENT',
    {
      type: 'workflow.agent-execute',
      payload: {
        workflowId: ctx.state.id,
        plan: ctx.state.plan?.plan,
        stepIndex: ctx.facts.currentStepIndex,
        traceId: ctx.state.traceId,
      },
    },
    'Human approved, proceeding with execution'
  );
}

/**
 * Human rejected workflow
 */
export function decideHumanRejected(ctx: EvalContext): Decision {
  return fail('Workflow rejected by human approver');
}

// ============================================================================
// CONTROL FLOW DECISIONS
// ============================================================================

/**
 * Pause workflow
 */
export function decidePause(ctx: EvalContext): Decision {
  return pause('Workflow paused by user request');
}

/**
 * Resume workflow
 * 
 * Next Status: Back to CREATED for re-evaluation
 */
export function decideResume(ctx: EvalContext): Decision {
  return emitCommandDecision(
    'CREATED',
    {
      type: 'workflow.agent-execute',
      payload: {
        goal: ctx.state.goal,
        resume: true,
      },
    },
    'Workflow resumed'
  );
}

/**
 * Cancel workflow
 */
export function decideCancel(ctx: EvalContext): Decision {
  return fail('Workflow cancelled by user request');
}

// ============================================================================
// COMPLETION DECISIONS
// ============================================================================

/**
 * Complete workflow successfully
 */
export function decideComplete(ctx: EvalContext): Decision {
  return complete('Workflow goal achieved');
}

/**
 * Fail workflow permanently
 */
export function decideFail(ctx: EvalContext): Decision {
  const lastError = ctx.state.state.errors[ctx.state.state.errors.length - 1];
  return fail(lastError || 'Workflow failed');
}

// ============================================================================
// NO-OP DECISIONS
// ============================================================================

/**
 * No operation - event ignored
 */
export function decideNoOp(ctx: EvalContext): Decision {
  return noop(`Event ${ctx.event.type} ignored in status ${ctx.state.status}`);
}

/**
 * Duplicate event detected
 */
export function decideDuplicate(ctx: EvalContext): Decision {
  return noop('Duplicate event ignored');
}

/**
 * Stale event detected
 */
export function decideStale(ctx: EvalContext): Decision {
  return noop('Stale event ignored');
}

/**
 * Workflow in terminal state
 */
export function decideTerminal(ctx: EvalContext): Decision {
  return noop(`Workflow already in terminal state: ${ctx.state.status}`);
}

// ============================================================================
// DECISION REGISTRY
// ============================================================================

/**
 * Central registry of all decision functions
 * 
 * @description
 * Exported for testing and documentation.
 */
export const decisions = {
  // Planning
  decideNeedsPlanning,
  decideApplyPlan,
  decidePlannerFailureRetry,
  decidePlannerFailure,

  // Policy
  decidePolicyApproved,
  decideNeedsHumanApproval,

  // Agent Execution
  decideExecuteNextStep,
  decideAgentCompleted,
  decideAgentFailureRetry,
  decideAgentFailure,

  // Human Approval
  decideHumanApproved,
  decideHumanRejected,

  // Control Flow
  decidePause,
  decideResume,
  decideCancel,

  // Completion
  decideComplete,
  decideFail,

  // No-Op
  decideNoOp,
  decideDuplicate,
  decideStale,
  decideTerminal,
} as const;

/**
 * Type-safe decision function names
 */
export type DecisionName = keyof typeof decisions;