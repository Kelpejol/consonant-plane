-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('CREATED', 'RUNNING', 'WAITING_ON_PLANNER', 'WAITING_ON_POLICY', 'WAITING_ON_AGENT', 'WAITING_ON_HUMAN', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'default',
    "submittedBy" TEXT,
    "traceId" TEXT NOT NULL,
    "rootSpanId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_history" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previousStatus" "WorkflowStatus",
    "newStatus" "WorkflowStatus" NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "reason" TEXT,
    "decision" TEXT,
    "decisionInput" JSONB,
    "decisionOutput" JSONB,
    "spanId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_states" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "currentPlan" JSONB,
    "lastAgentResult" JSONB,
    "context" JSONB NOT NULL DEFAULT '{}',
    "lastHistorySeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflows_idempotencyKey_key" ON "workflows"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_traceId_key" ON "workflows"("traceId");

-- CreateIndex
CREATE INDEX "workflows_status_idx" ON "workflows"("status");

-- CreateIndex
CREATE INDEX "workflows_traceId_idx" ON "workflows"("traceId");

-- CreateIndex
CREATE INDEX "workflows_createdAt_idx" ON "workflows"("createdAt");

-- CreateIndex
CREATE INDEX "workflows_submittedBy_idx" ON "workflows"("submittedBy");

-- CreateIndex
CREATE INDEX "workflows_environment_status_idx" ON "workflows"("environment", "status");

-- CreateIndex
CREATE INDEX "workflow_history_workflowId_timestamp_idx" ON "workflow_history"("workflowId", "timestamp");

-- CreateIndex
CREATE INDEX "workflow_history_eventType_idx" ON "workflow_history"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_history_workflowId_sequence_key" ON "workflow_history"("workflowId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_states_workflowId_key" ON "workflow_states"("workflowId");

-- AddForeignKey
ALTER TABLE "workflow_history" ADD CONSTRAINT "workflow_history_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_states" ADD CONSTRAINT "workflow_states_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
