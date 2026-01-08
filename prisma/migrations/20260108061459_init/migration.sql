-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CLUSTER_ERROR', 'AGENT_TRACE', 'AGENT_FAILED', 'AGENT_DEPLOYED', 'AGENT_EVENT', 'K8S_EVENT', 'K8S_POD_STATUS', 'OTEL_TRACE', 'OTEL_METRIC', 'INVOKE_RESPONSE', 'INVOKE_ERROR');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'VALIDATING', 'CONVERTING', 'DEPLOYING', 'ACTIVE', 'FAILED', 'UPDATING', 'DELETING', 'DELETED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('CLUSTER_REGISTRATION', 'AGENT_INVOCATION', 'CLUSTER_HEALTH_CHECK', 'EVENT_CLEANUP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ClusterStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "kagentVersion" TEXT,
    "kagentConfig" JSONB,
    "socketId" TEXT,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "clusterId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "terraDefinition" JSONB NOT NULL,
    "kagentCrd" JSONB,
    "image" TEXT NOT NULL,
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "cpuRequest" TEXT,
    "cpuLimit" TEXT,
    "memoryRequest" TEXT,
    "memoryLimit" TEXT,
    "deploymentId" TEXT,
    "deployedAt" TIMESTAMP(3),
    "error" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "labels" JSONB,
    "annotations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "parameters" JSONB,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clusters_name_key" ON "clusters"("name");

-- CreateIndex
CREATE UNIQUE INDEX "clusters_socketId_key" ON "clusters"("socketId");

-- CreateIndex
CREATE INDEX "clusters_status_idx" ON "clusters"("status");

-- CreateIndex
CREATE INDEX "clusters_lastSeenAt_idx" ON "clusters"("lastSeenAt");

-- CreateIndex
CREATE INDEX "events_clusterId_receivedAt_idx" ON "events"("clusterId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "events_type_receivedAt_idx" ON "events"("type", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_deploymentId_key" ON "Agent"("deploymentId");

-- CreateIndex
CREATE INDEX "Agent_clusterId_idx" ON "Agent"("clusterId");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Agent_createdAt_idx" ON "Agent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_clusterId_name_key" ON "Agent"("clusterId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_requestId_key" ON "agent_runs"("requestId");

-- CreateIndex
CREATE INDEX "agent_runs_clusterId_status_idx" ON "agent_runs"("clusterId", "status");

-- CreateIndex
CREATE INDEX "agent_runs_requestId_idx" ON "agent_runs"("requestId");

-- CreateIndex
CREATE INDEX "agent_runs_status_createdAt_idx" ON "agent_runs"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "jobs_status_scheduledFor_idx" ON "jobs"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
