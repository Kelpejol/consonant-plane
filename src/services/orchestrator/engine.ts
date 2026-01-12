/**
 * @fileoverview Consonant Workflow Orchestration Engine
 * @module orchestrator/engine
 * 
 * @description
 * The orchestration engine coordinates workflow execution using
 * table-driven decision making. This is the entry point for all
 * orchestration operations.
 * 
 * @architecture
 * ```
 * orchestrate(workflowId, event) {
 *   1. Load state from database
 *   2. Evaluate => decision
 *   3. Build new state
 *   4. Persist new state
 *   5. Emit command (if needed)
 *   6. Return result
 * }
 * ```
 * 
 * **Key principle**: ONE decision per invocation.
 * No loops. No polling. Progress driven by events.
 * 
 * @author Consonant Team
 * @version 0.1.0 (Table-Driven)
 */

import type { PrismaClient } from '@prisma/client';
import type {
    WorkflowEvent,
    OrchestrationResult,
    WorkflowState,
    Decision,
} from './types.js';
import { isTerminal } from './types.js';
import { evaluate, buildNewState, extractCommand } from './evaluator.js';
import { emitOrchestrationCommand } from '../inngest/client.js';
import { logger } from '../../utils/logger.js';
import { prismaManager } from '../db/manager.js';

// ============================================================================
// ORCHESTRATION ENGINE
// ============================================================================

/**
 * Orchestration Engine
 * 
 * @class
 * 
 * @description
 * Manages workflow orchestration using table-driven decision making.
 * 
 * **Core Loop**:
 * Event → Load → Evaluate → Persist → Emit → Stop
 * 
 * @example
 * ```typescript
 * const engine = new OrchestrationEngine(prisma);
 * 
 * const result = await engine.orchestrate('wf-123', {
 *   type: 'ORCHESTRATION_TRIGGER',
 *   trigger: 'initial',
 *   timestamp: Date.now()
 * });
 * ```
 */
export class OrchestrationEngine {
    constructor(private readonly prisma: PrismaClient) { }

    /**
     * Execute single orchestration cycle
     * 
     * @description
     * This is the heart of the orchestration engine:
     * 1. Load workflow from database
     * 2. Evaluate (state, event) => decision
     * 3. Build new state
     * 4. Persist new state + history
     * 5. Emit command (if needed)
     * 6. Return result
     * 
     * **Critical**: This does ONE decision and stops.
     * No loops. Progress driven by events.
     * 
     * @param workflowId - Workflow identifier
     * @param event - Event to process
     * @returns Orchestration result
     * 
     * @throws {Error} If workflow not found or operation fails
     */
    async orchestrate(
        workflowId: string,
        event: WorkflowEvent
    ): Promise<OrchestrationResult> {
        logger.info(
            { workflowId, eventType: event.type },
            '[Engine] Starting orchestration cycle'
        );

        try {
            // =====================================================================
            // STEP 1: Load workflow from database
            // =====================================================================
            const workflow = await this.loadWorkflow(workflowId);

            // Get status as at now so we can use for previous status param
            const previousStatus = workflow.status;

            // =====================================================================
            // STEP 2: Evaluate (state, event) => decision
            // =====================================================================
            logger.debug(
                { workflowId, status: workflow.status, eventType: event.type },
                '[Engine] Evaluating decision'
            );

            const decision = evaluate(workflow, event);

            logger.info(
                { workflowId, decisionType: decision.type },
                '[Engine] Decision made'
            );

            // =====================================================================
            // STEP 3: Build new state
            // =====================================================================
            const newState = buildNewState(workflow, decision, event);

            // =====================================================================
            // STEP 4: Persist new state + history
            // =====================================================================
            await this.persistState(workflow, newState, decision, event);

            // =====================================================================
            // STEP 5: Emit command (if needed)
            // =====================================================================
            const command = extractCommand(decision);

            if (command) {
                await emitOrchestrationCommand(workflowId, command, workflow.traceId);
            }

            // =====================================================================
            // STEP 6: Return result
            // =====================================================================
            const result: OrchestrationResult = {
                workflowId,
                decision,
                previousStatus,
                newStatus: newState.status,
                nextTick: newState.state.tick,
                command: command ?? undefined,
                timestamp: new Date(),
            };

            logger.info(
                {
                    workflowId,
                    previousStatus,
                    newStatus: newState.status,
                    decisionType: decision.type,
                    commandEmitted: !!command,
                },
                '[Engine] Orchestration cycle completed'
            );

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            logger.error(
                { workflowId, eventType: event.type, error: errorMessage },
                '[Engine] Orchestration failed'
            );

            throw error;
        }
    }

    // ==========================================================================
    // PRIVATE METHODS
    // ==========================================================================

    /**
     * Load workflow state from database
     * 
     * @private
     */
    private async loadWorkflow(workflowId: string): Promise<WorkflowState> {
        logger.debug({ workflowId }, '[Engine] Loading workflow state');

        const workflow = await this.prisma.workflow.findUnique({
            where: { id: workflowId },
            include: {
                state: true,
                plan: true,
                history: {
                    orderBy: { sequence: 'asc' }
                }
            }
        });

        if (!workflow || !workflow.state) {
            throw new Error(`Workflow ${workflowId} not found or missing state`);
        }

        return workflow as WorkflowState;
    }

    /**
     * Persist new state and create history record
     * 
     * @private
     */
    private async persistState(
        oldState: WorkflowState,
        newState: WorkflowState,
        decision: Decision,
        event: WorkflowEvent
    ): Promise<void> {
        logger.debug(
            { workflowId: newState.id, tick: newState.state.tick },
            '[Engine] Persisting state'
        );

        await this.prisma.$transaction(async (tx) => {
            // 1. Update Workflow status and timestamps
            const workflowData: any = {
                status: newState.status,
                updatedAt: newState.updatedAt,
            };

            if (isTerminal(newState.status)) {
                workflowData.completedAt = new Date();
            } else if (oldState.status === 'CREATED' && newState.status !== 'CREATED') {
                workflowData.startedAt = new Date();
            }

            await tx.workflow.update({
                where: { id: newState.id },
                data: workflowData
            });

            // 2. Update WorkflowState
            await tx.workflowState.update({
                where: { workflowId: newState.id },
                data: {
                    retryCount: newState.state.retryCount,
                    errors: newState.state.errors,
                    tick: newState.state.tick,
                    lastHistorySeq: newState.state.lastHistorySeq,
                    lastAgentResult: newState.state.lastAgentResult || undefined,
                    updatedAt: newState.state.updatedAt,
                }
            });

            // 3. Update WorkflowPlan if it exists and has changed
            // We assume evaluate/applyDecision might have updated step statuses
            if (newState.plan) {
                await tx.workflowPlan.update({
                    where: { workflowId: newState.id },
                    data: {
                        plan: newState.plan.plan as any
                    }
                });
            }

            // 4. Create History record
            await tx.workflowHistory.create({
                data: {
                    workflowId: newState.id,
                    sequence: newState.state.lastHistorySeq,
                    previousStatus: oldState.status,
                    newStatus: newState.status,
                    eventType: event.type,
                    eventData: event as any,
                    decision: decision.type,
                    reason: (decision as any).reason || (decision as any).error || 'No reason provided',
                    decisionInput: event as any,
                    decisionOutput: decision as any,
                }
            });
        });

        logger.info(
            { workflowId: newState.id, status: newState.status },
            '[Engine] State persisted'
        );
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

/**
 * Singleton orchestrator instance
 */
export let orchestrator: OrchestrationEngine;

/**
 * Initialize singleton orchestrator
 * 
 * @param prisma - Prisma client instance
 */
export async function initializeOrchestrator(): Promise<void> {
    const prisma = await prismaManager.getClient()
    orchestrator = new OrchestrationEngine(prisma);
    logger.info('[Engine] Orchestrator initialized');
}

