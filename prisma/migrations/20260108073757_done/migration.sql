/*
  Warnings:

  - You are about to drop the `agents` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "agents";

-- CreateTable
CREATE TABLE "agent_definitions" (
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

    CONSTRAINT "agent_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_definitions_deploymentId_key" ON "agent_definitions"("deploymentId");

-- CreateIndex
CREATE INDEX "agent_definitions_clusterId_idx" ON "agent_definitions"("clusterId");

-- CreateIndex
CREATE INDEX "agent_definitions_status_idx" ON "agent_definitions"("status");

-- CreateIndex
CREATE INDEX "agent_definitions_createdAt_idx" ON "agent_definitions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_definitions_clusterId_name_key" ON "agent_definitions"("clusterId", "name");
