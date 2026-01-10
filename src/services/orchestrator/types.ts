/**
 * src/services/orchestrator/types.ts
 * 
 * Core types for the Terra Orchestration Engine.
 * Defines decision types, outcomes, and configuration.
 */

import { WorkflowStatus } from '@prisma/client';

/**
 * Types of decisions the orchestrator can make.
 * These drive the state machine transitions.
 */
export enum DecisionType {
    NEEDS_PLANNING = 'needs_planning',
    NEEDS_POLICY = 'needs_policy',
    NEEDS_AGENT = 'needs_agent',
    NEEDS_HUMAN = 'needs_human',
    GOAL_ACHIEVED = 'goal_achieved',
    FAILED = 'failed',
    WAIT = 'wait'
}

/**
 * A decision produced by the evaluator.
 * Contains the intent, reason, and any data needed for execution.
 */
export interface Decision {
    type: DecisionType;
    reason: string;
    nextStatus?: WorkflowStatus; // The status to transition to (optional, implied by type usually)
    payload?: Record<string, unknown>; // Data needed for the next step (e.g., plan input)
}

/**
 * Result of applying a decision.
 */
export interface OrchestrationResult {
    workflowId: string;
    decision: Decision;
    previousStatus: WorkflowStatus;
    newStatus: WorkflowStatus;
    timestamp: Date;
}

/**
 * Configuration for the orchestrator.
 */
export interface OrchestratorConfig {
    maxSteps: number;
    pollIntervalMs: number;
}
