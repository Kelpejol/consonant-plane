/**
 * src/inngest/client.ts
 * 
 * Inngest client initialization with properly typed event schemas.
 */

import { Inngest, EventSchemas } from 'inngest';
import { logger } from '../../utils/logger.js';
import type { TerraEvents, TerraEventName } from './events.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY || 'local';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// ============================================================================
// INNGEST CLIENT
// ============================================================================

/**
 * Main Inngest client for the Terra platform.
 * 
 * Configured with typed event schemas for full type safety across
 * event emission and function definitions.
 */
export const inngest = new Inngest({
  id: 'terra-platform',
  eventKey: INNGEST_EVENT_KEY,
  schemas: new EventSchemas().fromRecord<TerraEvents>(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send a single Inngest event with proper typing and error handling.
 * 
 * @param event - Complete event object with name, data, and optional user
 * @returns Event ID if successful, null otherwise
 * 
 * @example
 * ```typescript
 * await sendEvent({
 *   name: 'terra.agent.created',
 *   data: {
 *     agentId: 'uuid',
 *     agentName: 'my-agent',
 *     clusterId: 'cluster-uuid',
 *     requestId: 'req-id',
 *     createdAt: new Date().toISOString(),
 *   },
 *   user: {
 *     userId: 'user-123',
 *   },
 * });
 * ```
 */
export async function sendEvent<K extends TerraEventName>(
  event: TerraEvents[K]
): Promise<string | null> {
  try {
    const result = await inngest.send(event);
    
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

/**
 * Send multiple Inngest events in batch.
 * 
 * @param events - Array of events to send
 * @returns Array of event IDs
 * 
 * @example
 * ```typescript
 * await sendEvents([
 *   {
 *     name: 'terra.agent.created',
 *     data: { ... },
 *   },
 *   {
 *     name: 'terra.agent.validated',
 *     data: { ... },
 *   },
 * ]);
 * ```
 */
export async function sendEvents(
  events: Array<TerraEvents[TerraEventName]>
): Promise<string[]> {
  try {
    const result = await inngest.send(events);
    
    logger.info({
      count: events.length,
      eventIds: result.ids,
    }, 'Inngest events sent');
    
    return result.ids;
  } catch (error) {
    logger.error({
      count: events.length,
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to send Inngest events');
    
    return [];
  }
}

/**
 * Type-safe event sender factory.
 * Creates a function for sending a specific event type.
 * 
 * @param eventName - Name of the event to send
 * @returns Function that sends the event
 * 
 * @example
 * ```typescript
 * const sendAgentCreated = createEventSender('terra.agent.created');
 * 
 * await sendAgentCreated({
 *   name: 'terra.agent.created',
 *   data: {
 *     agentId: 'uuid',
 *     agentName: 'my-agent',
 *     clusterId: 'cluster-uuid',
 *     requestId: 'req-id',
 *     createdAt: new Date().toISOString(),
 *   },
 * });
 * ```
 */
export function createEventSender<K extends TerraEventName>(eventName: K) {
  return async (event: TerraEvents[K]) => {
    return sendEvent(event);
  };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check Inngest connection health by sending a test event.
 * 
 * @returns True if healthy, false otherwise
 */
export async function checkInngestHealth(): Promise<boolean> {
  try {
    await sendEvent({
      name: 'terra.system.health-check',
      data: {
        timestamp: Date.now(),
        source: 'terra-platform',
      },
    });
    
    return true;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Inngest health check failed');
    
    return false;
  }
}

// ============================================================================
// DEV MODE HELPERS
// ============================================================================

/**
 * Check if running in development mode with Inngest Dev Server.
 */
export function isInngestDevMode(): boolean {
  return !IS_PROD && INNGEST_EVENT_KEY === 'local';
}

/**
 * Log Inngest configuration for debugging.
 */
export function logInngestConfig(): void {
  logger.info({
    environment: NODE_ENV,
    isProduction: IS_PROD,
    isDevMode: isInngestDevMode(),
    hasEventKey: INNGEST_EVENT_KEY,
  }, 'Inngest client initialized');
}

// Initialize on module load
logInngestConfig();