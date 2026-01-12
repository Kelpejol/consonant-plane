/**
 * @fileoverview Inngest event definitions for  Orchestration
 * @module services/inngest/events
 * 
 * @description
 * Event definitions for Inngest events.
 * 
 * @author Consonant Team
 * @version 0.1.0
 */


import { EventSchemas } from 'inngest';

/**
 * Consonant workflow event types
 */
export type ConsonantEvents = {
  // Orchestration control events
  'workflow.orchestration-trigger': {
    data: {
      workflowId: string;
      traceId: string;
      trigger: 'initial' | 'resume' | 'retry';
    };
  };

  // Planner events
  'workflow.planner-generate': {
    data: {
      workflowId: string;
      goal: string;
      traceId: string;
    };
  };
  'workflow.planner-completed': {
    data: {
      workflowId: string;
      plan: any;
      reasoning: string;
      traceId: string;
    };
  };
  'workflow.planner-failed': {
    data: {
      workflowId: string;
      error: string;
      retryable: boolean;
      traceId: string;
    };
  };

  // Policy events
  'workflow.policy-evaluate': {
    data: {
      workflowId: string;
      plan: any;
      traceId: string;
    };
  };
  'workflow.policy-completed': {
    data: {
      workflowId: string;
      result: 'passed' | 'failed' | 'needs_approval';
      reason?: string;
      violations?: string[];
      traceId: string;
    };
  };

  // Agent events
  'workflow.agent-execute': {
    data: {
      workflowId: string;
      plan: any;
      stepIndex: number;
      traceId: string;
    };
  };
  'workflow.agent-completed': {
    data: {
      workflowId: string;
      result: {
        success: boolean;
        output: any;
        duration: number;
        agentId: string;
      };
      traceId: string;
    };
  };
  'workflow.agent-failed': {
    data: {
      workflowId: string;
      error: string;
      retryable: boolean;
      traceId: string;
    };
  };

  // Human approval events
  'workflow.human-request-approval': {
    data: {
      workflowId: string;
      plan: any;
      reason: string;
      traceId: string;
    };
  };
  'workflow.human-approved': {
    data: {
      workflowId: string;
      approver: string;
      comments?: string;
      traceId: string;
    };
  };
  'workflow.human-rejected': {
    data: {
      workflowId: string;
      approver: string;
      reason: string;
      traceId: string;
    };
  };

  // Control events
  'workflow.pause': {
    data: {
      workflowId: string;
      reason: string;
      traceId: string;
    };
  };
  'workflow.resume': {
    data: {
      workflowId: string;
      traceId: string;
    };
  };
  'workflow.cancel': {
    data: {
      workflowId: string;
      reason: string;
      traceId: string;
    };
  };

  // Fired when agent is created
  'agent.created': {
    data: {
      agentId: string;
      agentName: string;
      clusterId: string;
      requestId: string;
      createdAt: string;
    };
  };

  // Fired when agent is validated
  'agent.validated': {
    data: {
      agentId: string;
      valid: boolean;
      errors?: string[];
      warnings?: string[];
      requestId: string;
    };
  };

  // Fired when agent is converted from consonant yaml definition to kagent
  // Triggers the deployment workflow
  'agent.converted': {
    data: {
      agentId: string;
      agentName: string;
      clusterId: string;
      success: boolean;
      error?: string;
      requestId: string;
    };
  };

  // Fired when agent is sent to relayer for deployment
  'agent.deployment-requested': {
    data: {
      agentId: string;
      clusterId: string;
      requestId: string;
    };
  };

  // Fired when deployment to cluster is complete (from relayer callback)
  'agent.deployed': {
    data: {
      agentId: string;
      clusterId: string;
      success: boolean;
      deploymentId?: string;
      error?: string;
      requestId: string;
      deployedAt: string;
    };
  };

  // Fired when agent fails at any stage
  'agent.failed': {
    data: {
      agentId: string;
      stage: 'validation' | 'conversion' | 'deployment';
      error: string;
      stackTrace?: string;
      requestId: string;
      retryCount: number;
    };
  };

  // Fired when agent status needs to be updated
  'agent.status-updated': {
    data: {
      agentId: string;
      previousStatus: string;
      newStatus: string;
      reason?: string;
      timestamp: string;
    };
  };

  // Fired when agent is deleted
  'agent.deleted': {
    data: {
      agentId: string;
      clusterId: string;
      requestId: string;
    };
  };

  // Fired when deployment status in relayer changes
  'agent.deployment-status-updated': {
    data: {
      agentId: string;
      clusterId: string;
      deploymentId: string;
      previousStatus: string;
      newStatus: string;
      timestamp: string;
    };
  };

  // Fired when agent deployment is cancelled
  'agent.deployment-cancelled': {
    data: {
      agentId: string;
      clusterId: string;
      deploymentId: string;
      requestId: string;
    };
  };

  //Fired when a cluster is registered
  'cluster.registered': {
    data: {
      clusterId: string;
      clusterName: string;
      namespace: string;
      kagentVersion?: string;
      registeredAt: string;
    };
  };

  //Fired when a cluster connection status changes
  'cluster.connection-changed': {
    data: {
      clusterId: string;
      connected: boolean;
      reason?: string;
      timestamp: string;
    };
  };
};

export const schemas = new EventSchemas().fromRecord<ConsonantEvents>();
