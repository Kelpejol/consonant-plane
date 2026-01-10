import { prismaManager } from './src/services/db/index.js';
import { inngest } from './src/services/inngest/client.js';
import { logger } from './src/utils/logger.js';

async function retryTrigger() {
    await prismaManager.initialize(logger);
    const prisma = await prismaManager.getClient();

    const workflow = await prisma.workflow.findFirst({
        where: { status: 'CREATED' },
        orderBy: { createdAt: 'desc' }
    });

    if (!workflow) {
        console.log('No CREATED workflow found.');
        return;
    }

    console.log(`Found stuck workflow: ${workflow.id}`);

    await inngest.send({
        name: 'terra.workflow.orchestration-trigger',
        data: {
            workflowId: workflow.id,
            traceId: workflow.traceId || 'manual-retry',
            trigger: 'manual_retry'
        }
    });

    console.log('Trigger event sent.');
}

retryTrigger()
    .catch(console.error)
    .finally(() => process.exit(0));
