/**
 * verify_logic_direct.ts
 * 
 * Verifies the Orchestrator + Planner logic directly, bypassing Inngest triggers.
 * Mimics the logic inside the Inngest function.
 */

import { prismaManager } from './src/services/db/index.js';
import { orchestrator } from './src/services/orchestrator/engine.js';
import { plannerClient } from './src/services/planner/client.js';
import { DecisionType } from './src/services/orchestrator/types.js';
import { logger } from './src/utils/logger.js';
// Fix for self-signed certs or similar if needed, though insecure used for gRPC

async function verifyDirect() {
    console.log('🚀 Starting Direct Logic Verification\n');

    await prismaManager.initialize(logger);
    const prisma = await prismaManager.getClient();

    // 1. Find a target workflow (or create one)
    // We'll reuse the one from previous attempts if available
    const workflow = await prisma.workflow.findFirst({
        where: { status: 'CREATED' },
        orderBy: { createdAt: 'desc' }
    });

    if (!workflow) {
        console.error('❌ No CREATED workflow found to verify.');
        process.exit(1);
    }

    console.log(`Target Workflow: ${workflow.id}`);
    console.log(`Current Status: ${workflow.status}`);

    // 2. Run Orchestrator Evaluation
    console.log('\n--- Step 1: Evaluate State ---');
    const result = await orchestrator.runOrchestration(workflow.id);

    if (!result) {
        console.log('Orchestrator returned null (paused/terminal).');
        return;
    }

    console.log(`Decision: ${result.decision.type}`);

    // 3. Mimic Inngest "Act" Step
    if (result.decision.type === DecisionType.NEEDS_PLANNING) {
        console.log('\n--- Step 2: Generate Plan (gRPC) ---');
        try {
            const plan = await plannerClient.generatePlan(workflow.goal, workflow.id);
            console.log('✅ Plan generated successfully.');
            console.log(`Steps: ${plan.steps.length}`);
            console.log(`Reasoning: ${plan.reasoning}`);

            console.log('\n--- Step 3: Apply Plan (DB) ---');
            await orchestrator.applyPlan(workflow.id, plan);
            console.log('✅ Plan applied.');

            // 4. Verify Final State
            const updated = await prisma.workflow.findUnique({
                where: { id: workflow.id },
                include: { state: true, history: true }
            });

            console.log(`\nFinal Status: ${updated?.status}`);
            if (updated?.status === 'RUNNING') {
                console.log('🎉 Verification SUCCESS: Workflow transitioned to RUNNING via Planner.');
            } else {
                console.error('❌ Verification FAILED: Status did not update to RUNNING.');
                process.exit(1);
            }

        } catch (error: any) {
            console.error('❌ Planner interaction failed:', error);
            process.exit(1);
        }
    } else {
        console.log('Decision was not NEEDS_PLANNING. Skipping planner verification.');
    }
}

verifyDirect()
    .catch(console.error)
    .finally(async () => {
        // Force exit to close connections
        process.exit(0);
    });
