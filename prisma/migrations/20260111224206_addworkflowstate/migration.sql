/*
  Warnings:

  - You are about to drop the column `context` on the `workflow_states` table. All the data in the column will be lost.
  - You are about to drop the column `environment` on the `workflows` table. All the data in the column will be lost.
  - You are about to drop the column `idempotencyKey` on the `workflows` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `workflows` table. All the data in the column will be lost.
  - You are about to drop the column `submittedBy` on the `workflows` table. All the data in the column will be lost.
  - Added the required column `workflowStateId` to the `workflows` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "workflow_states" DROP CONSTRAINT "workflow_states_workflowId_fkey";

-- DropIndex
DROP INDEX "workflows_environment_status_idx";

-- DropIndex
DROP INDEX "workflows_idempotencyKey_key";

-- DropIndex
DROP INDEX "workflows_status_idx";

-- DropIndex
DROP INDEX "workflows_submittedBy_idx";

-- AlterTable
ALTER TABLE "workflow_states" DROP COLUMN "context",
ADD COLUMN     "execContext" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "status" "WorkflowStatus" NOT NULL DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE "workflows" DROP COLUMN "environment",
DROP COLUMN "idempotencyKey",
DROP COLUMN "status",
DROP COLUMN "submittedBy",
ADD COLUMN     "context" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "workflowStateId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workflowStateId_fkey" FOREIGN KEY ("workflowStateId") REFERENCES "workflow_states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
