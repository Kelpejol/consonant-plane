/**
 * src/routes/goals.route.ts
 * 
 * Goal ingestion API endpoint for Terra Orchestration Engine.
 * Implements POST /api/v1/goals for workflow creation.
 * 
 * Design principles:
 * - Idempotent: Same idempotency key returns same workflow
 * - Durable: Workflow persisted to database before emitting events
 * - Traceable: Full OpenTelemetry trace propagation
 * - Auditable: Initial history record created with full context
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateGoalSubmission } from '../schemas/goal.schema.js';
import { sendEvent } from '../services/inngest/client.js';
import { logger } from '../utils/logger.js';
import { generateUUID } from '../utils/crypto.js';
import { WorkflowStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';


// ============================================================================
// TYPES
// ============================================================================

interface CreateGoalBody {
    goal: string;
    environment?: string;
    idempotencyKey?: string;
    metadata?: Prisma.InputJsonValue;
    submittedBy?: string;
}

interface WorkflowResponse {
    id: string;
    goal: string;
    status: WorkflowStatus;
    environment: string;
    traceId: string;
    createdAt: string;
    isNew: boolean;
}



// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export async function goalRoutes(app: FastifyInstance) {
    /**
     * POST /api/v1/goals
     * 
     * Create a new workflow from a goal submission.
     * 
     * Features:
     * - Validates input using Zod schema
     * - Handles idempotency (retry-safe)
     * - Generates trace ID for distributed tracing
     * - Persists workflow and initial history atomically
     * - Emits orchestration trigger event
     */
    app.post('/goals', async (request: FastifyRequest, reply: FastifyReply) => {
        const startTime = Date.now();

        try {
            // Validate request body
            const validation = validateGoalSubmission(request.body);

            if (!validation.valid) {
                logger.warn(
                    { errors: validation.errors },
                    'Goal submission validation failed'
                );
                return reply.code(400).send({
                    success: false,
                    error: 'Validation failed',
                    errors: validation.errors,
                });
            }

            const { goal, environment, idempotencyKey, metadata, submittedBy } = validation.data as CreateGoalBody;

            // Check idempotency - return existing workflow if key matches
            if (idempotencyKey) {
                const existingWorkflow = await request.prisma.workflow.findUnique({
                    where: { idempotencyKey },
                    select: {
                        id: true,
                        goal: true,
                        status: true,
                        environment: true,
                        traceId: true,
                        createdAt: true,
                    },
                });

                if (existingWorkflow) {
                    logger.info(
                        { workflowId: existingWorkflow.id, idempotencyKey },
                        'Returning existing workflow for idempotency key'
                    );

                    return reply.code(200).send({
                        success: true,
                        data: {
                            id: existingWorkflow.id,
                            goal: existingWorkflow.goal,
                            status: existingWorkflow.status,
                            environment: existingWorkflow.environment,
                            traceId: existingWorkflow.traceId,
                            createdAt: existingWorkflow.createdAt.toISOString(),
                            isNew: false,
                        } satisfies WorkflowResponse,
                    });
                }
            }

            // Generate trace ID for distributed tracing
            // Use request header if provided, otherwise generate new
            const traceId =
                (request.headers['x-trace-id'] as string) ||
                generateUUID();

            // Generate root span ID
            const rootSpanId = generateUUID();

            // Prepare event data outside transaction to keep it light
            const historyEventData: Prisma.InputJsonValue = {
                goal,
                environment: environment || 'default',
                ...(idempotencyKey ? { idempotencyKey } : {}),
                ...(metadata ? { metadata } : {}),
                ...(submittedBy ? { submittedBy } : {}),
            };

            // Create everything in a single nested create for maximum performance and atomicity
            const workflow = await request.prisma.workflow.create({
                data: {
                    goal,
                    status: WorkflowStatus.CREATED,
                    environment: environment || 'default',
                    idempotencyKey: idempotencyKey || null,
                    submittedBy: submittedBy || null,
                    traceId,
                    rootSpanId,
                    // Nested create for history
                    history: {
                        create: {
                            sequence: 0,
                            previousStatus: null,
                            newStatus: WorkflowStatus.CREATED,
                            eventType: 'workflow.created',
                            eventData: historyEventData,
                            reason: 'Goal submitted by user',
                            spanId: rootSpanId,
                        }
                    },
                    // Nested create for state
                    state: {
                        create: {
                            context: metadata ? { userMetadata: metadata } : {},
                            lastHistorySeq: 0,
                        }
                    }
                },
                // Include state in return so we have it for any follow-up logic
                include: { state: true }
            });

            logger.info(
                {
                    workflowId: workflow.id,
                    goal: goal.substring(0, 50),
                    environment,
                    traceId,
                    durationMs: Date.now() - startTime,
                },
                'Workflow created successfully'
            );

            // Emit orchestration trigger event
            // This will be picked up by the orchestration loop (implemented in later sections)
            await sendEvent({
                name: 'terra.workflow.orchestration-trigger',
                data: {
                    workflowId: workflow.id,
                    traceId,
                    trigger: 'initial',
                },
            });

            // Also emit workflow created event for audit/monitoring
            await sendEvent({
                name: 'terra.workflow.created',
                data: {
                    workflowId: workflow.id,
                    goal,
                    environment: environment || 'default',
                    traceId,
                    submittedBy,
                    createdAt: workflow.createdAt.toISOString(),
                },
            });

            return reply.code(201).send({
                success: true,
                data: {
                    id: workflow.id,
                    goal: workflow.goal,
                    status: workflow.status,
                    environment: workflow.environment,
                    traceId: workflow.traceId,
                    createdAt: workflow.createdAt.toISOString(),
                    isNew: true,
                } satisfies WorkflowResponse,
            });

        } catch (error) {
            logger.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                },
                'Failed to create workflow from goal'
            );

            return reply.code(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/goals/:id
     * 
     * Get workflow by ID with full status information.
     */
    app.get<{ Params: { id: string } }>('/goals/:id', async (request, reply) => {
        const { id } = request.params;

        const workflow = await request.prisma.workflow.findUnique({
            where: { id },
            include: {
                state: {
                    select: {
                        currentPlan: true,
                        lastAgentResult: true,
                        context: true,
                        lastHistorySeq: true,
                    },
                },
                history: {
                    orderBy: { sequence: 'desc' },
                    take: 1,
                    select: {
                        eventType: true,
                        reason: true,
                        timestamp: true,
                    },
                },
            },
        });

        if (!workflow) {
            return reply.code(404).send({
                success: false,
                error: 'Workflow not found',
            });
        }

        return {
            success: true,
            data: {
                id: workflow.id,
                goal: workflow.goal,
                status: workflow.status,
                environment: workflow.environment,
                traceId: workflow.traceId,
                currentStep: workflow.currentStep,
                error: workflow.error,
                errorCount: workflow.errorCount,
                createdAt: workflow.createdAt.toISOString(),
                updatedAt: workflow.updatedAt.toISOString(),
                startedAt: workflow.startedAt?.toISOString() || null,
                completedAt: workflow.completedAt?.toISOString() || null,
                state: workflow.state,
                lastEvent: workflow.history[0] || null,
            },
        };
    });

    /**
     * GET /api/v1/goals
     * 
     * List workflows with pagination and filtering.
     */
    app.get('/goals', async (request, reply) => {
        const query = request.query as {
            status?: string;
            environment?: string;
            limit?: string;
            offset?: string;
        };

        const take = Math.min(parseInt(query.limit || '50', 10), 100);
        const skip = parseInt(query.offset || '0', 10);

        const where: Record<string, unknown> = {};

        if (query.status) {
            where.status = query.status as WorkflowStatus;
        }
        if (query.environment) {
            where.environment = query.environment;
        }

        const [workflows, total] = await Promise.all([
            request.prisma.workflow.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
                skip,
                select: {
                    id: true,
                    goal: true,
                    status: true,
                    environment: true,
                    traceId: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            request.prisma.workflow.count({ where }),
        ]);

        return {
            success: true,
            data: workflows.map((w) => ({
                ...w,
                createdAt: w.createdAt.toISOString(),
                updatedAt: w.updatedAt.toISOString(),
            })),
            pagination: {
                total,
                limit: take,
                offset: skip,
                hasMore: skip + take < total,
            },
        };
    });

    /**
     * GET /api/v1/goals/:id/history
     * 
     * Get full workflow history for debugging and replay.
     */
    app.get<{ Params: { id: string } }>('/goals/:id/history', async (request, reply) => {
        const { id } = request.params;

        const workflow = await request.prisma.workflow.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!workflow) {
            return reply.code(404).send({
                success: false,
                error: 'Workflow not found',
            });
        }

        const history = await request.prisma.workflowHistory.findMany({
            where: { workflowId: id },
            orderBy: { sequence: 'asc' },
        });

        return {
            success: true,
            data: history.map((h) => ({
                ...h,
                timestamp: h.timestamp.toISOString(),
            })),
        };
    });
}
