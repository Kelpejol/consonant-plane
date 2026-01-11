/**
 * src/inngest/client.ts
 * 
 * Inngest client initialization with properly typed event schemas.
 */

import { Inngest, EventSchemas } from 'inngest';
import { logger } from '../../utils/logger.js';
import { schemas, ConsonantEvents } from './events.js';
import { WorkflowCommand } from '../orchestrator/types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY || 'local';



// ============================================================================
// INNGEST CLIENT
// ============================================================================

/**
 * Inngest client instance
 * 
 * @description
 * Configured with Consonant-specific event schemas.
 * Use this instance for all event operations.
 */
export const inngest = new Inngest({
  id: 'consonant',
  schemas,
  eventKey: INNGEST_EVENT_KEY,
});




// ============================================================================
// COMMAND EMITTER
// ============================================================================

/**
 * Emit command as Inngest event
 * 
 * @description
 * Converts orchestrator Command objects to Inngest events.
 * This is the bridge between the pure orchestrator and the event system.
 * 
 * @param workflowId - Workflow identifier
 * @param command - Command to emit
 * @param traceId - Distributed trace ID
 * 
 * @example
 * ```typescript
 * await emitCommand('wf-123', {
 *   type: 'planner.generate',
 *   payload: { goal: 'Deploy app' }
 * }, 'trace-456');
 * ```
 */
export async function emitOrchestrationCommand(
  workflowId: string,
  command: WorkflowCommand,
  traceId: string,
): Promise<void> {
  logger.info(
    { workflowId, commandType: command.type, traceId },
    '[Inngest] Emitting command'
  );

  try {
    // Use command.type directly as it now matches Inngest event names
    const eventName = command.type as keyof ConsonantEvents
    // Build event data
    const eventData = {
      workflowId,
      traceId,
      ...command.payload,
     
    };

    // Send event to Inngest
    await inngest.send({
      name: eventName,
      data: eventData,
    } as any);

    logger.info(
      { workflowId, eventName, traceId },
      '[Inngest] Command emitted successfully'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { workflowId, commandType: command.type, error: errorMessage },
      '[Inngest] Failed to emit command'
    );
    throw error;
  }
}

/**
 * Emit orchestration trigger event
 * 
 * @description
 * Helper to trigger orchestration cycle.
 * Used by HTTP endpoints and other entry points.
 */
export async function emitOrchestrationTrigger(
  workflowId: string,
  traceId: string,
  trigger: 'initial' | 'resume' | 'retry'
): Promise<void> {
  await inngest.send({
    name: 'workflow.orchestration-trigger',
    data: { workflowId, traceId, trigger },
  });
}

/**
 * Batch emit multiple events
 * 
 * @description
 * For workflows that need to emit multiple commands.
 * More efficient than individual sends.
 */
export async function emitBatch(
  events: Array<{ name: keyof ConsonantEvents; data: any }>
): Promise<void> {
  await inngest.send(events as any);
}


/**
 * General Inngest event emitter
 * 
 * @description
 * General purpose event emitter for Consonant events.
 * 
 * @param event - Event to emit
 * @returns Event ID if successful, null otherwise
 */
export async function sendEvent(
  event:
  { name: keyof ConsonantEvents; data: any }
): Promise<string | null> {
  try {
    const result = await inngest.send(event as any);
    
    logger.info({
      eventName: event.name,
      eventId: result.ids[0],
    }, 'Inngest event sent');
    
    return result.ids[0];
  } catch (error) {
    logger.error({
      eventName: event.name,
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to send Inngest event');
    
    return null;
  }
}