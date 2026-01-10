/**
 * verify_planner_e2e.ts
 * 
 * Verified the full flow:
 * 1. Submit Goal (HTTP)
 * 2. Inngest triggers orchestrator
 * 3. Orchestrator calls Python Planner (gRPC)
 * 4. Plan persisted in DB
 * 5. Workflow transitions to RUNNING
 */

import axios from 'axios';
import { prismaManager } from './src/services/db/index.js';
import { logger } from './src/utils/logger.js';
import { WorkflowStatus } from '@prisma/client';

const API_URL = 'http://localhost:3000/api/v1/goals';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function verify() {
    console.log('🚀 Starting E2E Planner Verification\n');

    await prismaManager.initialize(logger);
    const prisma = await prismaManager.getClient();

    try {
        // 1. Submit Goal
        const goal = "Analyze the codebase structure and suggest improvements";
        console.log(`Sending goal: "${goal}"`);

        const response = await axios.post(API_URL, {
            goal,
            environment: "test-env"
        });

        const { id: workflowId, traceId } = response.data.data;
        console.log(`- Workflow Created: ${workflowId}`);
        console.log(`- Trace ID: ${traceId}`);

        // 2. Poll for status change
        console.log('\nPolling for plan generation...');
        let attempts = 0;
        while (attempts < 30) { // 30 seconds timeout
            const workflow = await prisma.workflow.findUnique({
                where: { id: workflowId },
                include: { history: true, state: true }
            });

            if (!workflow) throw new Error('Workflow disappeared!');

            process.stdout.write(`\r[${attempts}s] Status: ${workflow.status}   `);

            if (workflow.status === 'RUNNING') {
                console.log('\n\n✅ Workflow is RUNNING!');

                // Check history
                const planEvent = workflow.history.find(h => h.eventType === 'planner.plan_generated');
                if (planEvent) {
                    console.log('- Found history event: planner.plan_generated');
                    console.log(`- Plan reasoning: ${planEvent.reason}`);
                } else {
                    console.error('❌ Missing planner.plan_generated event in history');
                    process.exit(1);
                }

                // Check state
                if (workflow.state?.currentPlan) {
                    console.log('- Plan stored in WorkflowState');
                    console.log('- Plan steps:', (workflow.state.currentPlan as any).steps?.length);
                } else {
                    console.error('❌ Plan missing in WorkflowState');
                    process.exit(1);
                }

                console.log('\n🎉 E2E Verification Successful!');
                process.exit(0);
            }

            await sleep(1000);
            attempts++;
        }

        console.error('\n\n❌ Timeout waiting for RUNNING status');
        process.exit(1);

    } catch (error: any) {
        console.error('\n❌ Verification failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

verify();
