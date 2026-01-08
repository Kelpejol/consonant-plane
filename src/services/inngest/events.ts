/**
 * src/inngest/events.ts
 * 
 * Type-safe event definitions for the Terra platform.
 * 
 * All events follow the pattern:
 * - name: Hierarchical naming (terra.domain.action)
 * - data: Event payload (strongly typed)
 * - user: Optional user context
 * 
 * Event naming convention:
 * - terra.agent.*: Agent lifecycle events
 * - terra.cluster.*: Cluster events
 * - terra.deployment.*: Deployment events
 * - terra.system.*: System events
 */

// ============================================================================
// AGENT EVENTS
// ============================================================================

/**
 * Fired when a new agent is created and validated.
 * Triggers the conversion workflow.
 */
export interface AgentCreatedEvent {
  data: {
    /** Unique agent ID */
    agentId: string;
    /** Agent name */
    agentName: string;
    /** Target cluster ID */
    clusterId: string;
    /** Request ID for tracking */
    requestId: string;
    /** Timestamp of creation */
    createdAt: string;
  };
  user?: {
    /** User ID who created the agent */
    userId?: string;
    /** Tenant/organization ID */
    tenantId?: string;
  };
}

/**
 * Fired when agent validation is complete.
 * Can be success or failure.
 */
export interface AgentValidatedEvent {
  data: {
    /** Agent ID */
    agentId: string;
    /** Whether validation passed */
    valid: boolean;
    /** Validation errors (if any) */
    errors?: string[];
    /** Validation warnings (if any) */
    warnings?: string[];
    /** Request ID */
    requestId: string;
  };
}

/**
 * Fired when Terra -> Kagent conversion is complete.
 * Triggers the deployment workflow.
 */
export interface AgentConvertedEvent {
  data: {
    /** Agent ID */
    agentId: string;
    /** Agent name */
    agentName: string;
    /** Cluster ID */
    clusterId: string;
    /** Whether conversion succeeded */
    success: boolean;
    /** Error message (if failed) */
    error?: string;
    /** Request ID */
    requestId: string;
  };
}

/**
 * Fired when agent deployment to cluster is complete.
 */
export interface AgentDeployedEvent {
  data: {
    /** Agent ID */
    agentId: string;
    /** Cluster ID */
    clusterId: string;
    /** Whether deployment succeeded */
    success: boolean;
    /** Deployment ID from Kagent */
    deploymentId?: string;
    /** Error message (if failed) */
    error?: string;
    /** Request ID */
    requestId: string;
    /** Timestamp of deployment */
    deployedAt: string;
  };
}

/**
 * Fired when agent fails at any stage.
 */
export interface AgentFailedEvent {
  data: {
    /** Agent ID */
    agentId: string;
    /** Stage where failure occurred */
    stage: 'validation' | 'conversion' | 'deployment';
    /** Error message */
    error: string;
    /** Error stack trace (if available) */
    stackTrace?: string;
    /** Request ID */
    requestId: string;
    /** Retry count */
    retryCount: number;
  };
}

// ============================================================================
// DEPLOYMENT EVENTS
// ============================================================================

/**
 * Fired when deployment status changes.
 */
export interface DeploymentStatusChangedEvent {
  data: {
    /** Agent ID */
    agentId: string;
    /** Cluster ID */
    clusterId: string;
    /** Deployment ID */
    deploymentId: string;
    /** Previous status */
    previousStatus: string;
    /** New status */
    newStatus: string;
    /** Timestamp */
    timestamp: string;
  };
}

// ============================================================================
// CLUSTER EVENTS
// ============================================================================

/**
 * Fired when a cluster registers with the platform.
 */
export interface ClusterRegisteredEvent {
  data: {
    /** Cluster ID */
    clusterId: string;
    /** Cluster name */
    clusterName: string;
    /** Namespace */
    namespace: string;
    /** Kagent version */
    kagentVersion?: string;
    /** Timestamp */
    registeredAt: string;
  };
}

/**
 * Fired when cluster connection status changes.
 */
export interface ClusterConnectionChangedEvent {
  data: {
    /** Cluster ID */
    clusterId: string;
    /** Whether connected */
    connected: boolean;
    /** Reason for change */
    reason?: string;
    /** Timestamp */
    timestamp: string;
  };
}

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

/**
 * System health check event.
 */
export interface SystemHealthCheckEvent {
  data: {
    /** Timestamp */
    timestamp: number;
    /** Source component */
    source: string;
  };
}

/**
 * System error event.
 */
export interface SystemErrorEvent {
  data: {
    /** Error message */
    message: string;
    /** Error stack trace */
    stackTrace?: string;
    /** Component where error occurred */
    component: string;
    /** Error severity */
    severity: 'low' | 'medium' | 'high' | 'critical';
    /** Timestamp */
    timestamp: number;
  };
}

// ============================================================================
// EVENT REGISTRY
// ============================================================================

/**
 * Complete type-safe registry of all Terra platform events.
 * 
 * Usage with Inngest:
 * ```typescript
 * import { Inngest, EventSchemas } from 'inngest';
 * import type { TerraEvents } from './events';
 * 
 * const inngest = new Inngest({
 *   id: 'terra-platform',
 *   schemas: new EventSchemas().fromRecord<TerraEvents>()
 * });
 * ```
 */
export interface TerraEvents {
  // Agent events
  'terra.agent.created': AgentCreatedEvent;
  'terra.agent.validated': AgentValidatedEvent;
  'terra.agent.converted': AgentConvertedEvent;
  'terra.agent.deployed': AgentDeployedEvent;
  'terra.agent.failed': AgentFailedEvent;
  
  // Deployment events
  'terra.deployment.status-changed': DeploymentStatusChangedEvent;
  
  // Cluster events
  'terra.cluster.registered': ClusterRegisteredEvent;
  'terra.cluster.connection-changed': ClusterConnectionChangedEvent;
  
  // System events
  'terra.system.health-check': SystemHealthCheckEvent;
  'terra.system.error': SystemErrorEvent;
}

/**
 * Event name type (for autocomplete)
 */
export type TerraEventName = keyof TerraEvents;

/**
 * Get event data type by name
 */
export type TerraEventData<T extends TerraEventName> = TerraEvents[T]['data'];

/**
 * Get event user type by name
 */
export type TerraEventUser<T extends TerraEventName> = TerraEvents[T]['user'];