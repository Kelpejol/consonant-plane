/**
 * src/inngest/inngest-client.ts
 * 
 * Inngest client initialization and configuration.
 * 
 * This module creates the Inngest client with typed event schemas
 * and provides helper functions for sending events safely.
 */

import { Inngest, EventSchemas } from 'inngest';
import { logger } from '../../utils/logger.js';
import type { TerraEvents } from './events.js';

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
 * Configured with typed event schemas for full type safety.
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
 * Send a single Inngest event with error handling.
 * 
 * @param event - Event to send
 * @returns Event ID if successful, null otherwise
 */
export async function sendTerraEvent<K extends keyof TerraEvents>(
  event: {
    name: K;
    data: TerraEvents[K]['data'];
    user?: TerraEvents[K]['user'];
    ts?: number;
    id?: string;
  }
): Promise<string | null> {
  try {
    const result = await inngest.send(event);
    logger.info({
      eventName: event.name,
      eventId: result.ids[0],
    },'Inngest event sent');
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
 * Check if Inngest is running in development mode.
 */
export function isInngestDevMode(): boolean {
  return !IS_PROD && INNGEST_EVENT_KEY === 'local';
}

/**
 * Log Inngest configuration.
 */
export function logInngestConfig(): void {
  logger.info({
    environment: NODE_ENV,
    isDevMode: isInngestDevMode(),
  },'Inngest initialized');
}

// Log on initialization
logInngestConfig();