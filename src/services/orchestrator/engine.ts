/**
 * src/services/orchestrator/engine.ts
 * 
 * Core Orchestrator Engine.
 * Executes the orchestration loop for a single workflow.
 */

import { PrismaClient, WorkflowStatus } from '@prisma/client';
import { prismaManager } from '../db/index.js';
import { DecisionEvaluator, WorkflowWithState } from './evaluator.js';
import { applyTransition } from './transitions.js';
import { logger } from '../../utils/logger.js';
import { Decision, OrchestrationResult, DecisionType } from './types.js';
import { GeneratePlanResponse } from '../planner/client.js';

export class CoreOrchestrator {
    private evaluator: DecisionEvaluator;

    constructor() {
        this.evaluator = new DecisionEvaluator();
    }

    /**
     * Run one tick of the orchestration loop.
     * 
     * @param workflowId - ID of the workflow to process
     * @param traceId - Trace ID for logging/tracing
     */
    async runOrchestration(workflowId: string, traceId?: string): Promise<OrchestrationResult | null> {
        const client = await prismaManager.getClient();

        // 1. Load workflow with state
        const workflow = await client.workflow.findUnique({
            where: { id: workflowId },
            include: { state: true }
        });

        if (!workflow) {
            logger.error({ workflowId, traceId }, 'Workflow not found during orchestration');
            throw new Error(`Workflow ${workflowId} not found`);
        }

        // 2. Check if terminal or paused
        if (this.isTerminal(workflow.status) || workflow.status === 'PAUSED') {
            logger.info(
                { workflowId, status: workflow.status, traceId },
                'Orchestration skipped: Workflow is terminal or paused'
            );
            return null;
        }

        logger.debug(
            { workflowId, status: workflow.status, traceId },
            'Evaluating workflow state'
        );

        // 3. Evaluate next decision
        // Note: evaluate() is pure logic
        const decision = this.evaluator.evaluate(workflow);

        logger.info(
            { workflowId, decision: decision.type, traceId },
            'Decision evaluated'
        );

        // 4. Persist decision and transition state
        // applyTransition now uses a single atomic nested update, so no interactive $transaction is needed.
        const transition = await applyTransition(
            client as any, // Cast to any because applyTransition expects a transaction client, which is a subset of client.
            workflow.id,
            workflow.status,
            workflow.state?.lastHistorySeq ?? -1,
            decision,
            traceId
        );

        return {
            workflowId: workflow.id,
            decision,
            previousStatus: transition.previousStatus!,
            newStatus: transition.newStatus,
            timestamp: new Date()
        };
    }


    /**
     * Apply a generated plan to the workflow.
     * Transitions state from WAITING_ON_PLANNER -> RUNNING (or other).
     */
    async applyPlan(workflowId: string, plan: GeneratePlanResponse, traceId?: string): Promise<void> {
        const client = await prismaManager.getClient();

        // 1. Fetch current sequence
        const workflow = await client.workflow.findUnique({
            where: { id: workflowId },
            include: { state: true }
        });

        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const nextSequence = (workflow.state?.lastHistorySeq ?? -1) + 1;

        // 2. Perform atomic nested update
        await client.workflow.update({
            where: { id: workflowId },
            data: {
                status: WorkflowStatus.RUNNING,
                updatedAt: new Date(),
                // Nested update for state
                state: {
                    update: {
                        currentPlan: plan as any,
                        lastHistorySeq: nextSequence
                    }
                },
                // Nested create for history record
                history: {
                    create: {
                        sequence: nextSequence,
                        previousStatus: WorkflowStatus.WAITING_ON_PLANNER,
                        newStatus: WorkflowStatus.RUNNING,
                        eventType: 'planner.plan_generated',
                        eventData: plan as any,
                        reason: plan.reasoning,
                        spanId: traceId
                    }
                }
            }
        });

        logger.info({ workflowId, traceId }, 'Plan applied successfully');
    }

    private isTerminal(status: WorkflowStatus): boolean {
        return status === 'COMPLETED' || status === 'FAILED';
    }
}

export const orchestrator = new CoreOrchestrator();
