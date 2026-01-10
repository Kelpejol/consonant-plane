/**
 * src/services/orchestrator/engine.test.ts
 * 
 * Standalone verification script for the Orchestration Engine.
 * Tests the core loop logic and database transitions.
 * 
 * Usage:
 * npx tsx src/services/orchestrator/engine.test.ts
 */

import { WorkflowStatus } from '@prisma/client';
import { prismaManager } from '../db/index.js';
import { orchestrator } from './engine.js';
import { DecisionType } from './types.js';
import { logger } from '../../utils/logger.js';
import { generateUUID } from '../../utils/crypto.js';

async function runTest() {
    console.log('🚀 Starting Orchestration Engine Verification\n');

    // Initialize DB
    await prismaManager.initialize(logger);
    const prisma = await prismaManager.getClient();

    try {
        // DO NOT TRUNCATE - we want to keep existing data
        // Just create a new unique workflow for this test

        // ========================================================================
        // TEST 1: Created -> Next Step (Needs Planning)
        // ========================================================================
        console.log('Test 1: Verifying CREATED -> WAITING_ON_PLANNER transition...');

        const workflowId = generateUUID();
        const traceId = generateUUID();

        // 1. Create initial workflow
        await prisma.workflow.create({
            data: {
                id: workflowId,
                goal: 'Test orchestration loop logic',
                status: WorkflowStatus.CREATED,
                traceId,
                state: {
                    create: {
                        context: {},
                        lastHistorySeq: -1 // Initial state has no history applied yet (effectively)
                    }
                }
            }
        });

        console.log(`- Created workflow ${workflowId} with status CREATED`);

        // 2. Run orchestration
        const result = await orchestrator.runOrchestration(workflowId, traceId);

        // 3. Verify result
        if (!result) {
            throw new Error('Orchestration skipped but should have run');
        }

        if (result.newStatus !== 'WAITING_ON_PLANNER') {
            throw new Error(`Expected status WAITING_ON_PLANNER, got ${result.newStatus}`);
        }

        if (result.decision.type !== DecisionType.NEEDS_PLANNING) {
            throw new Error(`Expected decision NEEDS_PLANNING, got ${result.decision.type}`);
        }

        // 4. Verify DB state
        const updatedWorkflow = await prisma.workflow.findUnique({
            where: { id: workflowId },
            include: { history: true, state: true }
        });

        if (updatedWorkflow?.status !== 'WAITING_ON_PLANNER') {
            throw new Error('DB status not updated');
        }

        const historyEntry = updatedWorkflow.history[0]; // Should have one entry (sequence 0)
        // Actually, if we created it manually without history, the first one triggered by orchestrator will be the first history?
        // In our `goals.route.ts`, we created seq 0.
        // Here we didn't create history seq 0 manually (oops).
        // so `applyTransition` will see no history, make seq 0.

        if (!historyEntry) {
            throw new Error('History entry not created');
        }

        console.log(`- Verified transition to ${updatedWorkflow.status}`);
        console.log(`- Verified history entry: ${historyEntry.eventType} (${historyEntry.reason})`);

        // ========================================================================
        // TEST 2: Completed State (Goal Achieved)
        // ========================================================================
        console.log('\nTest 2: Verifying GOAL_ACHIEVED transition...');

        const completeWorkflowId = generateUUID();
        await prisma.workflow.create({
            data: {
                id: completeWorkflowId,
                goal: 'Do something [TEST_COMPLETE]', // Trigger mock logic
                status: WorkflowStatus.RUNNING, // Start from RUNNING
                traceId: generateUUID(),
                state: { create: {} }
            }
        });

        const result2 = await orchestrator.runOrchestration(completeWorkflowId);

        if (result2?.newStatus !== 'COMPLETED') {
            throw new Error(`Expected status COMPLETED, got ${result2?.newStatus}`);
        }

        if (result2.decision.type !== DecisionType.GOAL_ACHIEVED) {
            throw new Error(`Expected decision GOAL_ACHIEVED, got ${result2.decision.type}`);
        }

        console.log('- Verified transition to COMPLETED');


        // ========================================================================
        // TEST 3: Paused State (Skip)
        // ========================================================================
        console.log('\nTest 3: Verifying PAUSED workflow skip...');

        await prisma.workflow.update({
            where: { id: workflowId },
            data: { status: 'PAUSED' }
        });

        const result3 = await orchestrator.runOrchestration(workflowId);

        if (result3 !== null) {
            throw new Error('Expected orchestration to return null for PAUSED workflow');
        }

        console.log('- Verified PAUSED workflow was skipped');

        console.log('\n✅ All tests passed successfully!');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runTest();
