/**
 * @fileoverview Terra Workflow Orchestration Engine
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
 *   3. Apply decision => new state
 *   4. Persist new state
 *   5. Emit command (if needed)
 *   6. Return result
 * }
 * ```
 * 
 * **Key principle**: ONE decision per invocation.
 * No loops. No polling. Progress driven by events.
 * 
 * @author Terra Infrastructure Team
 * @version 2.0.0 (Table-Driven)
 */

import type { PrismaClient } from '@prisma/client';
import type {
    WorkflowState,
    WorkflowEvent,
    OrchestrationResult,
    WorkflowCommand,
} from './types.js';
import { evaluate, applyDecision, requiresCommand, extractCommand } from './evaluator.js';
import { emitOrchestrationCommand} from '../inngest/client.js';
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
     * 3. Apply decision => new state
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
            // STEP 1: Load workflow state from database
            // =====================================================================
            const state = await this.loadWorkflowState(workflowId);

            if (!state) {
                throw new Error(`Workflow ${workflowId} not found`);
            }

            const previousStatus = state.status;

            // =====================================================================
            // STEP 2: Evaluate (state, event) => decision
            // =====================================================================
            logger.debug(
                { workflowId, status: state.status, eventType: event.type },
                '[Engine] Evaluating decision'
            );

            const decision = evaluate(state, event);

            logger.info(
                { workflowId, decisionType: decision.type },
                '[Engine] Decision made'
            );

            // =====================================================================
            // STEP 3: Apply decision => new state
            // =====================================================================
            const newState = applyDecision(state, decision, event);

            // =====================================================================
            // STEP 4: Persist new state + history
            // =====================================================================
            await this.persistState(newState, decision, event);

            // =====================================================================
            // STEP 5: Emit command (if needed)
            // =====================================================================
            const command = extractCommand(decision);

            if (command) {
            await emitOrchestrationCommand(workflowId, command, state.traceId);
            }

            // =====================================================================
            // STEP 6: Return result
            // =====================================================================
            const result: OrchestrationResult = {
                workflowId,
                decision,
                previousStatus,
                newStatus: newState.status,
                newVersion: newState.version,
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
    private async loadWorkflowState(workflowId: string): Promise<WorkflowState | null> {
        // TODO: Replace with actual Prisma query
        // This is a stub that returns mock data

        logger.debug({ workflowId }, '[Engine] Loading workflow state');

        // In production:
        // const workflow = await this.prisma.workflow.findUnique({
        //   where: { id: workflowId },
        //   include: { state: true, history: true }
        // });
        //
        // return this.mapToWorkflowState(workflow);

        // Mock for now
        return {
            id: workflowId,
            status: 'CREATED',
            goal: 'Deploy application',
            traceId: 'trace-123',
            environment: 'production',
            plan: null,
            lastAgentResult: null,
            retryCount: 0,
            maxRetries: 3,
            errors: [],
            metadata: {},
            version: 1,
            lastHistorySeq: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    /**
     * Persist new state and create history record
     * 
     * @private
     */
    private async persistState(
        state: WorkflowState,
        decision: any,
        event: WorkflowEvent
    ): Promise<void> {
        logger.debug(
            { workflowId: state.id, version: state.version },
            '[Engine] Persisting state'
        );

        // TODO: Replace with actual Prisma transaction
        // This is a stub

        // In production:
        // await this.prisma.$transaction(async (tx) => {
        //   await tx.workflow.update({
        //     where: { id: state.id },
        //     data: {
        //       status: state.status,
        //       version: state.version,
        //       updatedAt: new Date(state.updatedAt)
        //     }
        //   });
        //
        //   await tx.workflowState.upsert({
        //     where: { workflowId: state.id },
        //     create: { ... },
        //     update: { ... }
        //   });
        //
        //   await tx.workflowHistory.create({
        //     data: {
        //       workflowId: state.id,
        //       sequence: state.lastHistorySeq,
        //       previousStatus: ...,
        //       newStatus: state.status,
        //       eventType: event.type,
        //       eventData: event,
        //       decision: decision,
        //       reason: decision.reason || decision.error
        //     }
        //   });
        // });

        logger.info(
            { workflowId: state.id, status: state.status },
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

