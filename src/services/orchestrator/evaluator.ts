/**
 * src/services/orchestrator/evaluator.ts
 * 
 * Decision Evaluator
 * 
 * The "Brain" of the orchestrator.
 * Analyzes the current workflow state and determines the next best action.
 * 
 * In a full implementation, this would:
 * - Check policy via OPA
 * - Consult LangGraph for planning
 * - Analyze agent outputs
 */

import { Workflow, WorkflowState, WorkflowStatus } from '@prisma/client';
import { Decision, DecisionType } from './types.js';

export type WorkflowWithState = Workflow & {
    state: WorkflowState | null;
};

export class DecisionEvaluator {
    /**
     * Evaluate the current state and return a decision.
     * This function MUST be pure and deterministic based on inputs.
     */
    evaluate(workflow: WorkflowWithState): Decision {
        // 1. Initial State -> Needs Planning
        if (workflow.status === 'CREATED') {
            return {
                type: DecisionType.NEEDS_PLANNING,
                reason: 'New workflow requires initial plan',
                nextStatus: 'WAITING_ON_PLANNER', // Transition to waiting for planner
                payload: {
                    goal: workflow.goal
                }
            };
        }

        // 2. Mock: Logic for testing completed state
        // In real implementation, this would check if the plan says we are done
        if (workflow.goal.includes('[TEST_COMPLETE]')) {
            return {
                type: DecisionType.GOAL_ACHIEVED,
                reason: 'Goal achieved (mock)',
                nextStatus: 'COMPLETED'
            };
        }

        // 3. Mock: Logic for testing failed state
        if (workflow.goal.includes('[TEST_FAIL]')) {
            return {
                type: DecisionType.FAILED,
                reason: 'Workflow failed (mock)',
                nextStatus: 'FAILED'
            };
        }

        // Default: Wait
        return {
            type: DecisionType.WAIT,
            reason: 'Waiting for external event or side-effect'
        };
    }
}
