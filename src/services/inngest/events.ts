/**
 * src/inngest/events.ts
 * 
 * Type-safe event definitions for Terra platform with Inngest.
 * 
 * Each event follows Inngest's expected structure with optional user context.
 */

// ============================================================================
// EVENT DEFINITIONS
// ============================================================================

/**
 * Fired when a new agent is created and validated.
 * Triggers the conversion workflow.
 */
export interface AgentCreatedEvent {
  name: 'terra.agent.created';
  data: {
    agentId: string;
    agentName: string;
    clusterId: string;
    requestId: string;
    createdAt: string;
  };
  user?: {
    userId?: string;
    tenantId?: string;
  };
}

/**
 * Fired when agent validation is complete.
 */
export interface AgentValidatedEvent {
  name: 'terra.agent.validated';
  data: {
    agentId: string;
    valid: boolean;
    errors?: string[];
    warnings?: string[];
    requestId: string;
  };
}

/**
 * Fired when Terra -> Kagent conversion is complete.
 * Triggers the deployment workflow.
 */
export interface AgentConvertedEvent {
  name: 'terra.agent.converted';
  data: {
    agentId: string;
    agentName: string;
    clusterId: string;
    success: boolean;
    error?: string;
    requestId: string;
  };
}

/**
 * Fired when agent is sent to mediator for deployment.
 */
export interface AgentDeploymentRequestedEvent {
  name: 'terra.agent.deployment-requested';
  data: {
    agentId: string;
    clusterId: string;
    requestId: string;
  };
}

/**
 * Fired when deployment to cluster is complete (from mediator callback).
 */
export interface AgentDeployedEvent {
  name: 'terra.agent.deployed';
  data: {
    agentId: string;
    clusterId: string;
    success: boolean;
    deploymentId?: string;
    error?: string;
    requestId: string;
    deployedAt: string;
  };
}

/**
 * Fired when agent fails at any stage.
 */
export interface AgentFailedEvent {
  name: 'terra.agent.failed';
  data: {
    agentId: string;
    stage: 'validation' | 'conversion' | 'deployment';
    error: string;
    stackTrace?: string;
    requestId: string;
    retryCount: number;
  };
}

/**
 * Fired when agent status needs to be updated.
 */
export interface AgentStatusUpdateEvent {
  name: 'terra.agent.status-updated';
  data: {
    agentId: string;
    previousStatus: string;
    newStatus: string;
    reason?: string;
    timestamp: string;
  };
}

// ============================================================================
// DEPLOYMENT EVENTS
// ============================================================================

/**
 * Fired when deployment status changes (from mediator).
 */
export interface DeploymentStatusChangedEvent {
  name: 'terra.deployment.status-changed';
  data: {
    agentId: string;
    clusterId: string;
    deploymentId: string;
    previousStatus: string;
    newStatus: string;
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
  name: 'terra.cluster.registered';
  data: {
    clusterId: string;
    clusterName: string;
    namespace: string;
    kagentVersion?: string;
    registeredAt: string;
  };
}

/**
 * Fired when cluster connection status changes.
 */
export interface ClusterConnectionChangedEvent {
  name: 'terra.cluster.connection-changed';
  data: {
    clusterId: string;
    connected: boolean;
    reason?: string;
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
  name: 'terra.system.health-check';
  data: {
    timestamp: number;
    source: string;
  };
}

/**
 * System error event.
 */
export interface SystemErrorEvent {
  name: 'terra.system.error';
  data: {
    message: string;
    stackTrace?: string;
    component: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: number;
  };
}

// ============================================================================
// EVENT REGISTRY
// ============================================================================

/**
 * Union type of all Terra events.
 * This is what Inngest expects.
 */
export type TerraEvents = {
  'terra.agent.created': AgentCreatedEvent;
  'terra.agent.validated': AgentValidatedEvent;
  'terra.agent.converted': AgentConvertedEvent;
  'terra.agent.deployment-requested': AgentDeploymentRequestedEvent;
  'terra.agent.deployed': AgentDeployedEvent;
  'terra.agent.failed': AgentFailedEvent;
  'terra.agent.status-updated': AgentStatusUpdateEvent;
  'terra.deployment.status-changed': DeploymentStatusChangedEvent;
  'terra.cluster.registered': ClusterRegisteredEvent;
  'terra.cluster.connection-changed': ClusterConnectionChangedEvent;
  'terra.system.health-check': SystemHealthCheckEvent;
  'terra.system.error': SystemErrorEvent;
};

/**
 * Event name type (for autocomplete).
 */
export type TerraEventName = keyof TerraEvents;

/**
 * Get event payload type by name.
 */
export type TerraEventPayload<T extends TerraEventName> = TerraEvents[T];