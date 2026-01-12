import type {
  Workflow as PrismaWorkflow,
  WorkflowState as PrismaWorkflowState,
  WorkflowPlan as PrismaWorkflowPlan,
  WorkflowHistory,
} from '@prisma/client';

// ============================================================================
// WORKFLOW STATUS
// ============================================================================

/**
 * Workflow status enum
 * 
 * @description
 * These map 1:1 to database enum values.
 * Adding a new status requires:
 * 1. Add here
 * 2. Add to Prisma schema
 * 3. Add transitions in transition table
 */
import { WorkflowStatus } from '@prisma/client';
import { ConsonantEvents } from '../inngest/events.js';
export { WorkflowStatus };

/**
 * Terminal statuses that end workflow execution
 */
export const TERMINAL_STATUSES: readonly WorkflowStatus[] = ['COMPLETED', 'FAILED'] as const;

/**
 * Check if status is terminal
 */
export function isTerminal(status: WorkflowStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// ============================================================================
// WORKFLOW EVENTS
// ============================================================================

/**
 * Event type enum
 */
export type EventType =
  | 'ORCHESTRATION_TRIGGER'
  | 'PLANNER_COMPLETED'
  | 'PLANNER_FAILED'
  | 'POLICY_COMPLETED'
  | 'AGENT_COMPLETED'
  | 'AGENT_FAILED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'PAUSE'
  | 'RESUME'
  | 'CANCEL';

/**
 * Base event structure
 */
export interface WorkflowEvent {
  readonly type: EventType;
  readonly timestamp: number;
  readonly sequence?: number;
  readonly  tick?: number;
}

/**
 * Orchestration trigger event
 */
export interface OrchestrationTriggerEvent extends WorkflowEvent {
  readonly type: 'ORCHESTRATION_TRIGGER';
  readonly trigger: 'initial' | 'resume' | 'retry';
}

/**
 * Planner completed event
 */
export interface PlannerCompletedEvent extends WorkflowEvent {
  readonly type: 'PLANNER_COMPLETED';
  readonly plan: WorkflowPlan;
  readonly reasoning: string;
}

/**
 * Planner failed event
 */
export interface PlannerFailedEvent extends WorkflowEvent {
  readonly type: 'PLANNER_FAILED';
  readonly error: string;
  readonly retryable: boolean;
}

/**
 * Policy evaluation result
 * - 'passed': Policy check passed, proceed
 * - 'failed': Policy check failed, stop workflow
 * - 'needs_approval': Policy requires human approval
 */
export type PolicyResult = 'passed' | 'failed' | 'needs_approval';

/**
 * Policy completed event
 */
export interface PolicyCompletedEvent extends WorkflowEvent {
  readonly type: 'POLICY_COMPLETED';
  readonly result: PolicyResult;
  readonly reason?: string;
  readonly violations?: readonly string[];
}

/**
 * Agent completed event
 */
export interface AgentCompletedEvent extends WorkflowEvent {
  readonly type: 'AGENT_COMPLETED';
  readonly result: AgentResult;
}

/**
 * Agent failed event
 */
export interface AgentFailedEvent extends WorkflowEvent {
  readonly type: 'AGENT_FAILED';
  readonly error: string;
  readonly retryable: boolean;
}

/**
 * Human approved event
 */
export interface HumanApprovedEvent extends WorkflowEvent {
  readonly type: 'HUMAN_APPROVED';
  readonly approver: string;
  readonly comments?: string;
}

/**
 * Human rejected event
 */
export interface HumanRejectedEvent extends WorkflowEvent {
  readonly type: 'HUMAN_REJECTED';
  readonly approver: string;
  readonly reason: string;
}

/**
 * Pause event
 */
export interface PauseEvent extends WorkflowEvent {
  readonly type: 'PAUSE';
  readonly reason: string;
}

/**
 * Resume event
 */
export interface ResumeEvent extends WorkflowEvent {
  readonly type: 'RESUME';
}

/**
 * Cancel event
 */
export interface CancelEvent extends WorkflowEvent {
  readonly type: 'CANCEL';
  readonly reason: string;
}

// ============================================================================
// WORKFLOW STATE
// ============================================================================

/**
 * Plan step
 */
export interface PlanStep {
  readonly id: string;
  readonly description: string;
  readonly agentSelector: string;
  readonly dependencies: readonly string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  result?: unknown;
}

/**
 * Workflow plan
 */
export interface WorkflowPlan {
  readonly steps: readonly PlanStep[];
  readonly reasoning: string;
  readonly estimatedDuration?: number;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  readonly success: boolean;
  readonly output: unknown;
  readonly duration: number;
  readonly agentId: string;
  readonly error?: string;
}

/**
 * Complete workflow state (Single Source of Truth)
 * 
 * @description
 * This is a composite type that represents the full workflow state
 * as fetched from the database with all relations included.
 */
export type WorkflowState = PrismaWorkflow & {
  state: PrismaWorkflowState;
  plan: PrismaWorkflowPlan | null;
  history: WorkflowHistory[];
};

// ============================================================================
// DERIVED FACTS
// ============================================================================

/**
 * Derived facts from workflow state
 * 
 * @description
 * Facts are computed ONCE per evaluation and passed to all guards.
 * This ensures:
 * - No repeated computation
 * - Single source of truth
 * - Easy to test
 */
export interface DerivedFacts {
  /** Has a plan been generated */
  readonly hasPlan: boolean;

  /** Are there remaining steps to execute */
  readonly hasRemainingSteps: boolean;

  /** Did last agent execution fail */
  readonly lastStepFailed: boolean;

  /** Have we exceeded retry limit */
  readonly retriesExhausted: boolean;

  /** Is policy evaluation required */
  readonly needsPolicyEvaluation: boolean;

  /** Current step index (if executing) */
  readonly currentStepIndex: number;

  /** Total number of steps */
  readonly totalSteps: number;

  /** All steps completed */
  readonly allStepsCompleted: boolean;
}

// ============================================================================
// DECISION TYPES
// ============================================================================

/**
 * Command to be emitted 
 */
export interface Command {
  readonly type: keyof ConsonantEvents;
  readonly payload: Record<string, unknown>;
}

/**
 * Decision types
 */
export type DecisionType =
  | 'EMIT_COMMAND'
  | 'PAUSE'
  | 'COMPLETE'
  | 'FAIL'
  | 'NO_OP';

/**
 * Emit command decision
 */
export interface EmitCommandDecision {
  readonly type: 'EMIT_COMMAND';
  readonly nextStatus: WorkflowStatus;
  readonly command: Command;
  readonly reason: string;
}

/**
 * Pause decision
 */
export interface PauseDecision {
  readonly type: 'PAUSE';
  readonly nextStatus: 'PAUSED';
  readonly reason: string;
}

/**
 * Complete decision
 */
export interface CompleteDecision {
  readonly type: 'COMPLETE';
  readonly nextStatus: 'COMPLETED';
  readonly reason: string;
}

/**
 * Fail decision
 */
export interface FailDecision {
  readonly type: 'FAIL';
  readonly nextStatus: 'FAILED';
  readonly error: string;
}

/**
 * No-op decision (event ignored)
 */
export interface NoOpDecision {
  readonly type: 'NO_OP';
  readonly reason: string;
}

/**
 * Union of all decision types
 */
export type Decision =
  | EmitCommandDecision
  | PauseDecision
  | CompleteDecision
  | FailDecision
  | NoOpDecision;

// ============================================================================
// EVALUATION CONTEXT
// ============================================================================

/**
 * Context passed to decision functions
 * 
 * @description
 * Everything a decision function needs is here.
 * Decision functions MUST be pure - they can only read this context.
 */
export interface EvalContext {
  /** Current workflow state */
  readonly state: WorkflowState;

  /** Event being processed */
  readonly event: WorkflowEvent;

  /** Derived facts (computed once) */
  readonly facts: DerivedFacts;

  /** Replay mode flag */
  readonly replay?: boolean;
}

// ============================================================================
// TRANSITION TABLE TYPES
// ============================================================================

/**
 * Decision function signature
 */
export type DecisionFunction = (ctx: EvalContext) => Decision;

/**
 * Guard function signature
 */
export type GuardFunction = (facts: DerivedFacts) => boolean;

/**
 * Transition rule
 */
export interface TransitionRule {
  /** When this guard returns true */
  readonly when: GuardFunction;

  /** Execute this decision function */
  readonly decide: DecisionFunction;

  /** Human-readable description */
  readonly description?: string;
}

/**
 * Event handlers for a given status
 */
export type EventHandlers = {
  readonly [K in EventType]?: DecisionFunction;
};

/**
 * Complete transition table
 */
export type TransitionTable = {
  readonly [K in WorkflowStatus]?: EventHandlers;
};

// ============================================================================
// ORCHESTRATION RESULT
// ============================================================================

/**
 * Result of orchestration cycle
 */
export interface OrchestrationResult {
  /** Workflow ID */
  readonly workflowId: string;

  /** Decision made */
  readonly decision: Decision;

  /** Previous status */
  readonly previousStatus: WorkflowStatus;

  /** New status (after applying decision) */
  readonly newStatus: WorkflowStatus;

  /** Next tick */
  readonly nextTick: number;

  /** Command to emit (if any) */
  readonly command?: Command;

  /** Timestamp */
  readonly timestamp: Date;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create no-op decision
 */
export function noop(reason: string): NoOpDecision {
  return { type: 'NO_OP', reason };
}

/**
 * Create fail decision
 */
export function fail(error: string): FailDecision {
  return { type: 'FAIL', nextStatus: 'FAILED', error };
}

/**
 * Create complete decision
 */
export function complete(reason: string): CompleteDecision {
  return { type: 'COMPLETE', nextStatus: 'COMPLETED', reason };
}

/**
 * Create pause decision
 */
export function pause(reason: string): PauseDecision {
  return { type: 'PAUSE', nextStatus: 'PAUSED', reason };
}

/**
 * Create emit command decision
 */
export function emitCommandDecision(
  nextStatus: WorkflowStatus,
  command: Command,
  reason: string
): EmitCommandDecision {
  return { type: 'EMIT_COMMAND', nextStatus, command, reason };
}