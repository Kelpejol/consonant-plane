-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME,
    "kagentVersion" TEXT,
    "kagentConfig" JSONB,
    "socketId" TEXT
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clusterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "events_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clusterId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "parameters" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "agent_runs_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "scheduledFor" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME
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
