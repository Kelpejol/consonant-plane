/**
 * @fileoverview Guard Functions for Workflow Orchestration
 * @module orchestrator/guards
 * 
 * @description
 * Pure boolean predicates that express workflow conditions.
 * Guards are the ONLY place where complex logic lives.
 * 
 * @principles
 * - Guards are pure functions: (facts) => boolean
 * - Guards never mutate state
 * - Guards never cause side effects
 * - Guards read like English
 * - Complex conditions are composed, not nested
 * 
 * @example
 * ```typescript
 * const guards = {
 *   needsPlanning: (f) => !f.hasPlan,
 *   canExecuteNextStep: (f) => f.hasPlan && f.hasRemainingSteps,
 *   shouldRetry: (f) => f.lastStepFailed && !f.retriesExhausted
 * };
 * ```
 * 
 * @author Terra Infrastructure Team
 * @version 2.0.0 (Table-Driven)
 */

import type { DerivedFacts } from './types.js';

// ============================================================================
// PLANNING GUARDS
// ============================================================================

/**
 * Workflow needs a plan generated
 */
export function needsPlanning(facts: DerivedFacts): boolean {
  return !facts.hasPlan;
}

/**
 * Workflow has a valid plan
 */
export function hasPlan(facts: DerivedFacts): boolean {
  return facts.hasPlan;
}

// ============================================================================
// EXECUTION GUARDS
// ============================================================================

/**
 * Can execute next step in plan
 */
export function canExecuteNextStep(facts: DerivedFacts): boolean {
  return facts.hasPlan && facts.hasRemainingSteps;
}

/**
 * All steps have been completed
 */
export function allStepsCompleted(facts: DerivedFacts): boolean {
  return facts.hasPlan && facts.allStepsCompleted;
}

/**
 * Has remaining steps to execute
 */
export function hasRemainingSteps(facts: DerivedFacts): boolean {
  return facts.hasRemainingSteps;
}

// ============================================================================
// ERROR & RETRY GUARDS
// ============================================================================

/**
 * Last step failed
 */
export function lastStepFailed(facts: DerivedFacts): boolean {
  return facts.lastStepFailed;
}

/**
 * Should retry after failure
 */
export function shouldRetry(facts: DerivedFacts): boolean {
  return facts.lastStepFailed && !facts.retriesExhausted;
}

/**
 * Retry limit has been exceeded
 */
export function retriesExhausted(facts: DerivedFacts): boolean {
  return facts.retriesExhausted;
}

/**
 * Must fail due to exhausted retries
 */
export function mustFail(facts: DerivedFacts): boolean {
  return facts.lastStepFailed && facts.retriesExhausted;
}

// ============================================================================
// POLICY GUARDS
// ============================================================================

/**
 * Workflow needs policy evaluation
 */
export function needsPolicyEvaluation(facts: DerivedFacts): boolean {
  return facts.needsPolicyEvaluation;
}

// ============================================================================
// COMPOSITE GUARDS (AND/OR/NOT)
// ============================================================================

/**
 * Plan exists AND has remaining steps AND no failures
 */
export function canContinueExecution(facts: DerivedFacts): boolean {
  return facts.hasPlan && facts.hasRemainingSteps && !facts.lastStepFailed;
}

/**
 * Must escalate to human approval
 * 
 * Conditions:
 * - Has plan
 * - Policy evaluation required
 * - Last step failed
 * - Retries exhausted
 */
export function mustEscalateToHuman(facts: DerivedFacts): boolean {
  return (
    facts.hasPlan &&
    facts.needsPolicyEvaluation &&
    facts.lastStepFailed &&
    facts.retriesExhausted
  );
}

/**
 * Can retry execution
 * 
 * Conditions:
 * - Last step failed
 * - Retries not exhausted
 * - Has remaining steps
 */
export function canRetryExecution(facts: DerivedFacts): boolean {
  return (
    facts.lastStepFailed &&
    !facts.retriesExhausted &&
    facts.hasRemainingSteps
  );
}

/**
 * Workflow is ready to complete
 * 
 * Conditions:
 * - Has plan
 * - All steps completed
 * - No pending work
 */
export function isReadyToComplete(facts: DerivedFacts): boolean {
  return facts.hasPlan && facts.allStepsCompleted && !facts.hasRemainingSteps;
}

// ============================================================================
// GUARD REGISTRY
// ============================================================================

/**
 * Central registry of all guards
 * 
 * @description
 * Exported for testing and documentation.
 * Guards are grouped by concern.
 */
export const guards = {
  // Planning
  needsPlanning,
  hasPlan,
  
  // Execution
  canExecuteNextStep,
  allStepsCompleted,
  hasRemainingSteps,
  
  // Errors & Retries
  lastStepFailed,
  shouldRetry,
  retriesExhausted,
  mustFail,
  
  // Policy
  needsPolicyEvaluation,
  
  // Composite
  canContinueExecution,
  mustEscalateToHuman,
  canRetryExecution,
  isReadyToComplete,
} as const;

/**
 * Type-safe guard names
 */
export type GuardName = keyof typeof guards;

// ============================================================================
// GUARD HELPERS
// ============================================================================

/**
 * Create negated guard
 * 
 * @example
 * ```typescript
 * const hasNoPlan = not(hasPlan);
 * ```
 */
export function not(guard: (facts: DerivedFacts) => boolean) {
  return (facts: DerivedFacts) => !guard(facts);
}

/**
 * Create AND guard
 * 
 * @example
 * ```typescript
 * const canProceed = and(hasPlan, hasRemainingSteps);
 * ```
 */
export function and(...guards: Array<(facts: DerivedFacts) => boolean>) {
  return (facts: DerivedFacts) => guards.every(g => g(facts));
}

/**
 * Create OR guard
 * 
 * @example
 * ```typescript
 * const needsIntervention = or(mustFail, mustEscalateToHuman);
 * ```
 */
export function or(...guards: Array<(facts: DerivedFacts) => boolean>) {
  return (facts: DerivedFacts) => guards.some(g => g(facts));
}

/**
 * Always true guard (catch-all)
 */
export function always(): boolean {
  return true;
}

/**
 * Never true guard (for testing)
 */
export function never(): boolean {
  return false;
}