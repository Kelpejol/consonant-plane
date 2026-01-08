/*
  Warnings:

  - You are about to drop the `Agent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Agent";

-- CreateTable
CREATE TABLE "agents" (
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

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_deploymentId_key" ON "agents"("deploymentId");

-- CreateIndex
CREATE INDEX "agents_clusterId_idx" ON "agents"("clusterId");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "agents_createdAt_idx" ON "agents"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agents_clusterId_name_key" ON "agents"("clusterId", "name");
