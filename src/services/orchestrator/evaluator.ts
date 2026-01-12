/**
 * @fileoverview Workflow Orchestration Evaluator
 * @module orchestrator/evaluator
 * 
 * @description
 * The evaluator is the "brain" of the orchestration system.
 * It's a pure function: (state, event) => decision
 * 
 * **This is the ONLY place where control flow exists**.
 * Everything else is data.
 * 
 * @principles
 * - Evaluator is pure: no side effects
 * - Evaluator is deterministic: same inputs => same output
 * - Evaluator is replayable: can be run multiple times safely
 * - Evaluator is testable: easy to unit test
 * - Evaluator is simple: ~20 lines of code
 * 
 * @architecture
 * ```
 * evaluate(state, event) {
 *   1. Derive facts from state
 *   2. Look up transition table
 *   3. Call decision function
 *   4. Return decision
 * }
 * ```
 * 
 * @author Terra Infrastructure Team
 * @version 2.0.0 (Table-Driven)
 */

import type {
  WorkflowState,
  WorkflowEvent,
  Decision,
  DerivedFacts,
  EvalContext,
  WorkflowPlan,
  AgentResult,
} from './types.js';
import { noop, fail, isTerminal } from './types.js';
import { TRANSITIONS } from './transitions.js';

// ============================================================================
// DERIVED FACTS
// ============================================================================

/**
 * Derive facts from workflow state
 * 
 * @description
 * Facts are computed ONCE per evaluation.
 * All guards and decision functions use the same facts.
 * This ensures consistency and avoids repeated computation.
 * 
 * **Add new facts here** when you need new conditions.
 * 
 * @param state - Current workflow state
 * @returns Derived facts
 * 
 * @example
 * ```typescript
 * const facts = deriveFacts(state);
 * if (facts.hasPlan && facts.hasRemainingSteps) {
 *   // ...
 * }
 * ```
 */
export function deriveFacts(state: WorkflowState): DerivedFacts {
  const planJson = state.plan?.plan as unknown as WorkflowPlan | null;
  const lastAgentResult = state.state.lastAgentResult as unknown as AgentResult | null;

  const hasPlan = planJson !== null && planJson.steps.length > 0;

  const completedSteps = hasPlan
    ? planJson!.steps.filter(s => s.status === 'completed').length
    : 0;

  const totalSteps = hasPlan ? planJson!.steps.length : 0;

  const currentStepIndex = completedSteps;

  const hasRemainingSteps = hasPlan && completedSteps < totalSteps;

  const allStepsCompleted = hasPlan && completedSteps === totalSteps;

  const lastStepFailed = lastAgentResult?.success === false;

  const retriesExhausted = state.state.retryCount >= state.state.maxRetries;

  // TODO: Add policy evaluation logic
  const needsPolicyEvaluation = hasPlan;

  return {
    hasPlan,
    hasRemainingSteps,
    lastStepFailed,
    retriesExhausted,
    needsPolicyEvaluation,
    currentStepIndex,
    totalSteps,
    allStepsCompleted,
  };
}

// ============================================================================
// EDGE CASE CHECKS
// ============================================================================

/**
 * Check for duplicate event
 * 
 * @description
 * Events with sequence numbers less than or equal to the last processed
 * sequence are duplicates and should be ignored.
 */
function isDuplicateEvent(state: WorkflowState, event: WorkflowEvent): boolean {
  if (event.sequence === undefined) {
    return false;
  }
  return event.sequence <= state.state.lastHistorySeq;
}

/**
 * Check for stale event
 * 
 * @description
 * Events with version numbers less than the current state version
 * are stale and should be ignored.
 */
function isStaleEvent(state: WorkflowState, event: WorkflowEvent): boolean {
  if (event.version === undefined) {
    return false;
  }
  return event.version < state.state.tick;
}

// ============================================================================
// THE EVALUATOR (THE BRAIN)
// ============================================================================

/**
 * Evaluate workflow state and event to produce a decision
 * 
 * @description
 * This is the core of the orchestration engine.
 * It's a pure function that takes state and event and returns a decision.
 * 
 * **This is the ONLY place where control flow exists**.
 * 
 * Algorithm:
 * 1. Check for terminal states
 * 2. Check for duplicate/stale events
 * 3. Derive facts from state
 * 4. Look up transition in table
 * 5. Call decision function
 * 6. Return decision
 * 
 * @param state - Current workflow state
 * @param event - Event to process
 * @param replay - Replay mode flag (for testing)
 * @returns Decision object
 * 
 * @example
 * ```typescript
 * const decision = evaluate(state, event);
 * 
 * switch (decision.type) {
 *   case 'EMIT_COMMAND':
 *     await emitCommand(decision.command);
 *     break;
 *   case 'COMPLETE':
 *     await markComplete(state.id);
 *     break;
 *   // ...
 * }
 * ```
 */
export function evaluate(
  state: WorkflowState,
  event: WorkflowEvent,
  replay?: boolean
): Decision {
  // ===== EDGE CASE: Terminal states =====
  if (isTerminal(state.status)) {
    return noop(`Workflow already in terminal state: ${state.status}`);
  }

  // ===== EDGE CASE: Duplicate events =====
  if (isDuplicateEvent(state, event)) {
    return noop('Duplicate event ignored');
  }

  // ===== EDGE CASE: Stale events =====
  if (isStaleEvent(state, event)) {
    return noop('Stale event ignored');
  }

  // ===== STEP 1: Derive facts =====
  const facts = deriveFacts(state);

  // ===== STEP 2: Look up transition in table =====
  const stateTransitions = (TRANSITIONS)[state.status];

  if (!stateTransitions) {
    return fail(`No transitions defined for status: ${state.status}`);
  }

  const handler = stateTransitions[event.type];

  if (!handler) {
    return noop(`Event ${event.type} not handled in status ${state.status}`);
  }

  // ===== STEP 3: Build context =====
  const context: EvalContext = {
    state,
    event,
    facts,
    replay,
  };

  // ===== STEP 4: Call decision function =====
  const decision = handler(context);

  // ===== STEP 5: Return decision =====
  return decision;
}

// ============================================================================
//  Build New State
// ============================================================================

/**
 * Build new state from decision
 * 
 * @description
 * This function builds a new state from a decision.
 * It's pure - it doesn't mutate the input state.
 * 
 * **Separation of concerns**:
 * - Evaluator decides what to do
 * - This function builds the new state
 * 
 * This separation enables:
 * - Replay (evaluate without applying)
 * - Auditing (see what would happen)
 * - Testing (easy to mock)
 * 
 * @param state - Current workflow state
 * @param decision - Decision to apply
 * @param event - Event that triggered decision
 * @returns New workflow state
 * 
 * @example
 * ```typescript
 * const decision = evaluate(state, event);
 * const newState = buildNewState(state, decision, event);
 * await persistState(newState);
 * ```
 */
export function buildNewState(
  state: WorkflowState,
  decision: Decision,
  event: WorkflowEvent
): WorkflowState {
  // NO_OP decisions don't change state
  if (decision.type === 'NO_OP') {
    return state;
  }

  // Build new state with common updates
  const newState: WorkflowState = {
    ...state,
    status: decision.nextStatus,
    state: {
      ...state.state,
      tick: state.state.tick + 1,
      lastHistorySeq: event.sequence ?? state.state.lastHistorySeq + 1,
      updatedAt: new Date(),
    },
    updatedAt: new Date(),
  };

  // Type-specific updates
  switch (decision.type) {
    case 'EMIT_COMMAND':
      // Status updated above
      break;

    case 'PAUSE':
      // Status updated above
      break;

    case 'COMPLETE':
      // Status updated above
      break;

    case 'FAIL':
      // Add error to errors array
      newState.state.errors = [...state.state.errors, decision.error];
      break;
  }

  return newState;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if decision requires command emission
 */
export function requiresCommand(decision: Decision): boolean {
  return decision.type === 'EMIT_COMMAND';
}

/**
 * Check if decision is terminal
 */
export function isTerminalDecision(decision: Decision): boolean {
  return decision.type === 'COMPLETE' || decision.type === 'FAIL';
}

/**
 * Extract command from decision (if any)
 */
export function extractCommand(decision: Decision) {
  if (decision.type === 'EMIT_COMMAND') {
    return decision.command;
  }
  return null;
}
