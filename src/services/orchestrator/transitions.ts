/**
 * src/services/orchestrator/transitions.ts
 * 
 * Handles state transitions and history recordings.
 * All functions here should generally run within a Prisma transaction.
 */

import { Prisma, PrismaClient, WorkflowStatus } from '@prisma/client';
import { Decision, DecisionType } from './types.js';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Persist the decision and transition the workflow state.
 * 
 * @param tx - Prisma transaction client
 * @param workflowId - ID of the workflow
 * @param currentStatus - Current status before transition
 * @param currentSequence - Current history sequence number
 * @param decision - The decision made by the evaluator
 * @param spanId - Optional span ID for tracing
 */
export async function applyTransition(
    tx: PrismaTx,
    workflowId: string,
    currentStatus: WorkflowStatus,
    currentSequence: number,
    decision: Decision,
    spanId?: string
) {
    // 1. Determine new status
    // If decision specifies a nextStatus, use it. Otherwise keep current.
    const newStatus = decision.nextStatus || currentStatus;
    const nextSequence = currentSequence + 1;

    // 2. Perform atomic nested update
    // This combines history recording and status updates into one operation
    await tx.workflow.update({
        where: { id: workflowId },
        data: {
            status: newStatus,
            // If we achieved the goal or failed, set completedAt
            completedAt: ['COMPLETED', 'FAILED'].includes(newStatus) ? new Date() : undefined,
            // If we started running (from CREATED), set startedAt
            startedAt: (currentStatus === 'CREATED' && newStatus !== 'CREATED') ? new Date() : undefined,
            // Nested create for history
            history: {
                create: {
                    sequence: nextSequence,
                    previousStatus: currentStatus,
                    newStatus: newStatus,
                    eventType: `decision.${decision.type}`,
                    reason: decision.reason,
                    decision: decision.type,
                    decisionOutput: decision.payload ? (decision.payload as Prisma.InputJsonValue) : undefined,
                    spanId
                }
            },
            // Nested update for state
            state: {
                update: {
                    lastHistorySeq: nextSequence
                }
            }
        }
    });

    return { previousStatus: currentStatus, newStatus };
}
