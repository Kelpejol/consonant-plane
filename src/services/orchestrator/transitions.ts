/**
 * @fileoverview Transition Table for Workflow Orchestration
 * @module orchestrator/transitions
 * 
 * @description
 * The transition table is the SINGLE source of truth for all workflow behavior.
 * This is pure data - no runtime, no branching, no hidden logic.
 * 
 * @principles
 * - Table is immutable (const + satisfies)
 * - All transitions are explicit
 * - Adding new behavior = add row to table
 * - Changing behavior = modify table entry
 * - No logic outside this table
 * 
 * @example
 * To add a new transition:
 * ```typescript
 * TRANSITIONS.MY_STATUS = {
 *   MY_EVENT: decideMyAction
 * };
 * ```
 * 
 * @author Terra Infrastructure Team
 * @version 2.0.0 (Table-Driven)
 */

import type { TransitionTable } from './types.js';
import {
  decideNeedsPlanning,
  decideApplyPlan,
  decidePlannerFailureRetry,
  decidePlannerFailure,
  decidePolicyApproved,
  decideAgentCompleted,
  decideAgentFailureRetry,
  decideAgentFailure,
  decideHumanApproved,
  decideHumanRejected,
  decidePause,
  decideResume,
  decideCancel,
  decideNoOp,
} from './decisions.js';

// ============================================================================
// TRANSITION TABLE
// ============================================================================

/**
 * The complete transition table
 * 
 * @description
 * Maps: (WorkflowStatus, EventType) => DecisionFunction
 * 
 * **Reading the table**:
 * - Rows are workflow statuses
 * - Columns are event types
 * - Cells are decision functions
 * 
 * **Modifying the table**:
 * 1. Find the status row
 * 2. Find the event column
 * 3. Change the decision function
 * 
 * **Adding new behavior**:
 * 1. Add new status row (if needed)
 * 2. Add event handlers
 * 3. Add corresponding decision function
 * 
 * **This is the ONLY place where transitions are defined**.
 */
export const TRANSITIONS = {
  // ==========================================================================
  // CREATED - Initial workflow state
  // ==========================================================================
  CREATED: {
    // Start orchestration - need to generate plan
    ORCHESTRATION_TRIGGER: decideNeedsPlanning,
    
    // Control events
    PAUSE: decidePause,
    CANCEL: decideCancel,
    
    // All other events ignored
    PLANNER_COMPLETED: decideNoOp,
    PLANNER_FAILED: decideNoOp,
    POLICY_COMPLETED: decideNoOp,
    AGENT_COMPLETED: decideNoOp,
    AGENT_FAILED: decideNoOp,
    HUMAN_APPROVED: decideNoOp,
    HUMAN_REJECTED: decideNoOp,
    RESUME: decideNoOp,
  },

  // ==========================================================================
  // WAITING_ON_PLANNER - Plan generation in progress
  // ==========================================================================
  WAITING_ON_PLANNER: {
    // Plan generation completed
    PLANNER_COMPLETED: decideApplyPlan,
    
    // Plan generation failed
    PLANNER_FAILED: decidePlannerFailureRetry,
    
    // Control events
    PAUSE: decidePause,
    CANCEL: decideCancel,
    
    // All other events ignored
    ORCHESTRATION_TRIGGER: decideNoOp,
    POLICY_COMPLETED: decideNoOp,
    AGENT_COMPLETED: decideNoOp,
    AGENT_FAILED: decideNoOp,
    HUMAN_APPROVED: decideNoOp,
    HUMAN_REJECTED: decideNoOp,
    RESUME: decideNoOp,
  },

  // ==========================================================================
  // WAITING_ON_POLICY - Policy evaluation in progress
  // ==========================================================================
  WAITING_ON_POLICY: {
    // Policy evaluation completed
    POLICY_COMPLETED: decidePolicyApproved,
    
    // Control events
    PAUSE: decidePause,
    CANCEL: decideCancel,
    
    // All other events ignored
    ORCHESTRATION_TRIGGER: decideNoOp,
    PLANNER_COMPLETED: decideNoOp,
    PLANNER_FAILED: decideNoOp,
    AGENT_COMPLETED: decideNoOp,
    AGENT_FAILED: decideNoOp,
    HUMAN_APPROVED: decideNoOp,
    HUMAN_REJECTED: decideNoOp,
    RESUME: decideNoOp,
  },

  // ==========================================================================
  // WAITING_ON_AGENT - Agent execution in progress
  // ==========================================================================
  WAITING_ON_AGENT: {
    // Agent execution completed
    AGENT_COMPLETED: decideAgentCompleted,
    
    // Agent execution failed
    AGENT_FAILED: decideAgentFailureRetry,
    
    // Control events
    PAUSE: decidePause,
    CANCEL: decideCancel,
    
    // All other events ignored
    ORCHESTRATION_TRIGGER: decideNoOp,
    PLANNER_COMPLETED: decideNoOp,
    PLANNER_FAILED: decideNoOp,
    POLICY_COMPLETED: decideNoOp,
    HUMAN_APPROVED: decideNoOp,
    HUMAN_REJECTED: decideNoOp,
    RESUME: decideNoOp,
  },

  // ==========================================================================
  // WAITING_ON_HUMAN - Human approval required
  // ==========================================================================
  WAITING_ON_HUMAN: {
    // Human approved
    HUMAN_APPROVED: decideHumanApproved,
    
    // Human rejected
    HUMAN_REJECTED: decideHumanRejected,
    
    // Control events
    PAUSE: decidePause,
    CANCEL: decideCancel,
    
    // All other events ignored
    ORCHESTRATION_TRIGGER: decideNoOp,
    PLANNER_COMPLETED: decideNoOp,
    PLANNER_FAILED: decideNoOp,
    POLICY_COMPLETED: decideNoOp,
    AGENT_COMPLETED: decideNoOp,
    AGENT_FAILED: decideNoOp,
    RESUME: decideNoOp,
  },

  // ==========================================================================
  // PAUSED - Workflow manually paused
  // ==========================================================================
  PAUSED: {
    // Resume workflow
    RESUME: decideResume,
    
    // Cancel workflow
    CANCEL: decideCancel,
    
    // All other events ignored while paused
    ORCHESTRATION_TRIGGER: decideNoOp,
    PLANNER_COMPLETED: decideNoOp,
    PLANNER_FAILED: decideNoOp,
    POLICY_COMPLETED: decideNoOp,
    AGENT_COMPLETED: decideNoOp,
    AGENT_FAILED: decideNoOp,
    HUMAN_APPROVED: decideNoOp,
    HUMAN_REJECTED: decideNoOp,
    PAUSE: decideNoOp,
  },

  // ==========================================================================
  // COMPLETED - Terminal success state
  // ==========================================================================
  COMPLETED: {
    // All events ignored in terminal state
    ORCHESTRATION_TRIGGER: decideNoOp,
    PLANNER_COMPLETED: decideNoOp,
    PLANNER_FAILED: decideNoOp,
    POLICY_COMPLETED: decideNoOp,
    AGENT_COMPLETED: decideNoOp,
    AGENT_FAILED: decideNoOp,
    HUMAN_APPROVED: decideNoOp,
    HUMAN_REJECTED: decideNoOp,
    PAUSE: decideNoOp,
    RESUME: decideNoOp,
    CANCEL: decideNoOp,
  },

  // ==========================================================================
  // FAILED - Terminal failure state
  // ==========================================================================
  FAILED: {
    // All events ignored in terminal state
    ORCHESTRATION_TRIGGER: decideNoOp,
    PLANNER_COMPLETED: decideNoOp,
    PLANNER_FAILED: decideNoOp,
    POLICY_COMPLETED: decideNoOp,
    AGENT_COMPLETED: decideNoOp,
    AGENT_FAILED: decideNoOp,
    HUMAN_APPROVED: decideNoOp,
    HUMAN_REJECTED: decideNoOp,
    PAUSE: decideNoOp,
    RESUME: decideNoOp,
    CANCEL: decideNoOp,
  },
} as const satisfies TransitionTable;

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that transition table is complete
 * 
 * @description
 * This runs at module load time to catch missing transitions early.
 * If a status or event is missing, the system will fail fast.
 */
function validateTransitionTable(): void {
  const requiredStatuses: ReadonlyArray<string> = [
    'CREATED',
    'WAITING_ON_PLANNER',
    'WAITING_ON_POLICY',
    'WAITING_ON_AGENT',
    'WAITING_ON_HUMAN',
    'PAUSED',
    'COMPLETED',
    'FAILED',
  ];

  const requiredEvents: ReadonlyArray<string> = [
    'ORCHESTRATION_TRIGGER',
    'PLANNER_COMPLETED',
    'PLANNER_FAILED',
    'POLICY_COMPLETED',
    'AGENT_COMPLETED',
    'AGENT_FAILED',
    'HUMAN_APPROVED',
    'HUMAN_REJECTED',
    'PAUSE',
    'RESUME',
    'CANCEL',
  ];

  // Check all statuses are present
  for (const status of requiredStatuses) {
    if (!(status in TRANSITIONS)) {
      throw new Error(`Missing transition table entry for status: ${status}`);
    }
  }

  // Check all events are handled for each status
  for (const status of requiredStatuses) {
    const handlers = TRANSITIONS[status as keyof typeof TRANSITIONS];
    if (!handlers) continue;

    for (const event of requiredEvents) {
      if (!(event in handlers)) {
        throw new Error(`Missing handler for ${status} + ${event}`);
      }
    }
  }
}

// Run validation at module load
validateTransitionTable();

// ============================================================================
// TRANSITION METADATA
// ============================================================================

/**
 * Human-readable descriptions of transitions
 * 
 * @description
 * Used for documentation, logging, and debugging.
 * Not required for execution.
 */
export const TRANSITION_DESCRIPTIONS = {
  CREATED: {
    ORCHESTRATION_TRIGGER: 'Start workflow orchestration',
    PAUSE: 'Pause before planning',
    CANCEL: 'Cancel before planning',
  },
  WAITING_ON_PLANNER: {
    PLANNER_COMPLETED: 'Plan generated successfully',
    PLANNER_FAILED: 'Plan generation failed, retry or fail',
    PAUSE: 'Pause during planning',
    CANCEL: 'Cancel during planning',
  },
  WAITING_ON_POLICY: {
    POLICY_COMPLETED: 'Policy evaluation completed',
    PAUSE: 'Pause during policy evaluation',
    CANCEL: 'Cancel during policy evaluation',
  },
  WAITING_ON_AGENT: {
    AGENT_COMPLETED: 'Agent execution completed, check if more steps',
    AGENT_FAILED: 'Agent execution failed, retry or fail',
    PAUSE: 'Pause during execution',
    CANCEL: 'Cancel during execution',
  },
  WAITING_ON_HUMAN: {
    HUMAN_APPROVED: 'Human approved, proceed to execution',
    HUMAN_REJECTED: 'Human rejected, fail workflow',
    PAUSE: 'Pause while waiting for human',
    CANCEL: 'Cancel while waiting for human',
  },
  PAUSED: {
    RESUME: 'Resume paused workflow',
    CANCEL: 'Cancel paused workflow',
  },
} as const;
