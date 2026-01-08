/**
 * src/manifest/converters/terra-to-kagent.ts
 * 
 * Converts Terra agent manifests to Kagent CRDs.
 * 
 * This converter:
 * 1. Maps user-facing Terra configuration to Kagent BYO CRDs
 * 2. Injects Terra platform metadata and security defaults
 * 3. Adds operational wiring (identity, observability)
 * 4. Enforces security best practices
 * 
 * @example
 * ```typescript
 * import { convertTerraToKagent } from './terra-to-kagent';
 * 
 * const result = convertTerraToKagent(terraManifest, clusterId);
 * if (result.success) {
 *   console.log('CRD:', result.crd);
 * } else {
 *   console.error('Conversion failed:', result.error);
 * }
 * ```
 */

import type { TerraAgentManifest } from '../schemas/agent.schema.js';
import type {
  KagentCRD,
  ByoDeploymentSpec,
  EnvVar,
  ResourceRequirements,
} from '../types/agentManifest.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Conversion result containing CRD or error
 */
export interface ConversionResult {
  /** Whether conversion succeeded */
  success: boolean;
  /** Generated Kagent CRD (if successful) */
  crd?: KagentCRD;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Conversion options
 */
export interface ConversionOptions {
  /** Cluster ID for the target cluster */
  clusterId: string;
  /** Agent ID for tracking */
  agentId: string;
  /** Target namespace (defaults to 'terra-agents') */
  namespace?: string;
  /** Tenant/organization ID for multi-tenancy */
  tenantId?: string;
  /** Additional labels to inject */
  additionalLabels?: Record<string, string>;
  /** Additional annotations to inject */
  additionalAnnotations?: Record<string, string>;
}

// ============================================================================
// MAIN CONVERSION FUNCTION
// ============================================================================

/**
 * Convert a Terra agent manifest to a Kagent CRD.
 * 
 * This function performs the complete transformation from user-facing
 * Terra configuration to internal Kagent deployment specification.
 * 
 * @param manifest - Terra agent manifest
 * @param options - Conversion options
 * @returns Conversion result with CRD or error
 */
export function convertTerraToKagent(
  manifest: TerraAgentManifest,
  options: ConversionOptions
): ConversionResult {
  try {
    logger.info({
      agentName: manifest.metadata.name,
      agentId: options.agentId,
      clusterId: options.clusterId,
    }, 'Converting Terra agent to Kagent CRD');

    // Build the Kagent CRD
    const crd: KagentCRD = {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: buildMetadata(manifest, options),
      spec: {
        type: 'BYO',
        description: manifest.spec.description,
        byo: {
          deployment: buildDeployment(manifest, options),
        },
      },
    };

    logger.info({
      agentName: manifest.metadata.name,
      agentId: options.agentId,
    }, 'Successfully converted Terra agent to Kagent CRD');

    return {
      success: true,
      crd,
    };
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown conversion error';
    
    logger.error({
      error: errorMessage,
      agentName: manifest.metadata.name,
      agentId: options.agentId,
    },'Failed to convert Terra agent to Kagent CRD');

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// METADATA BUILDING
// ============================================================================

/**
 * Build Kagent metadata from Terra metadata with injected Terra labels.
 * 
 * Injects:
 * - terra.dev/agent-id: Agent UUID for tracking
 * - terra.dev/cluster-id: Target cluster ID
 * - terra.dev/tenant-id: Tenant/org ID (if provided)
 * - terra.dev/managed-by: Always "terra"
 * 
 * @param manifest - Terra agent manifest
 * @param options - Conversion options
 * @returns Kagent metadata
 */
function buildMetadata(
  manifest: TerraAgentManifest,
  options: ConversionOptions
) {
  const namespace = options.namespace || 
                    manifest.metadata.namespace || 
                    'terra-agents';

  // Merge labels with Terra platform labels
  const labels: Record<string, string> = {
    // User-provided labels
    ...manifest.metadata.labels,
    // Terra platform labels (override user labels)
    'terra.dev/agent-id': options.agentId,
    'terra.dev/cluster-id': options.clusterId,
    'terra.dev/managed-by': 'terra',
    'terra.dev/agent-name': manifest.metadata.name,
    // Additional labels
    ...options.additionalLabels,
  };

  // Add tenant ID if provided
  if (options.tenantId) {
    labels['terra.dev/tenant-id'] = options.tenantId;
  }

  // Merge annotations with Terra platform annotations
  const annotations: Record<string, string> = {
    // User-provided annotations
    ...manifest.metadata.annotations,
    // Terra platform annotations
    'terra.dev/created-at': new Date().toISOString(),
    'terra.dev/source': 'terra-agent-manifest',
    // Additional annotations
    ...options.additionalAnnotations,
  };

  return {
    name: generateKagentName(manifest.metadata.name, options.agentId),
    namespace,
    labels,
    annotations,
  };
}

/**
 * Generate a unique Kagent resource name.
 * 
 * Format: {agent-name}-{short-id}
 * 
 * @param name - Original agent name
 * @param agentId - Agent UUID
 * @returns Kagent resource name
 */
function generateKagentName(name: string, agentId: string): string {
  // Use first 8 characters of UUID for uniqueness
  const shortId = agentId.slice(0, 8);
  return `${name}-${shortId}`;
}

// ============================================================================
// DEPLOYMENT BUILDING
// ============================================================================

/**
 * Build Kagent BYO deployment specification from Terra config.
 * 
 * This function:
 * 1. Maps user configuration (image, entrypoint, args, env)
 * 2. Injects Terra platform environment variables
 * 3. Sets hardened security defaults
 * 4. Configures resource limits
 * 
 * @param manifest - Terra agent manifest
 * @param options - Conversion options
 * @returns Kagent deployment spec
 */
function buildDeployment(
  manifest: TerraAgentManifest,
  options: ConversionOptions
): ByoDeploymentSpec {
  const { runtime, deployment } = manifest.spec;

  const spec: ByoDeploymentSpec = {
    // Required fields
    image: runtime.image,
    
    // Optional basic fields from Terra
    cmd: runtime.entrypoint,
    args: runtime.args,
    replicas: deployment.scaling.replicas,
    
    // Environment variables (user + Terra injected)
    env: buildEnvironmentVariables(manifest, options),
    
    // Resource limits
    resources: buildResourceRequirements(manifest),
    
    // Image pull policy (default to IfNotPresent for reproducibility)
    imagePullPolicy: 'IfNotPresent',
    
    // Security context (hardened defaults)
    securityContext: buildSecurityContext(),
    
    // Pod security context (hardened defaults)
    podSecurityContext: buildPodSecurityContext(),
    
    // Labels for pod template
    labels: {
      'terra.dev/agent-id': options.agentId,
      'terra.dev/cluster-id': options.clusterId,
      'terra.dev/agent-name': manifest.metadata.name,
    },
  };

  return spec;
}

/**
 * Build environment variables with Terra platform injections.
 * 
 * Injects:
 * - TERRA_AGENT_ID: Agent UUID
 * - TERRA_AGENT_NAME: Agent name
 * - TERRA_CLUSTER_ID: Cluster ID
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OpenTelemetry endpoint
 * - OTEL_SERVICE_NAME: Service name for tracing
 * 
 * @param manifest - Terra agent manifest
 * @param options - Conversion options
 * @returns Array of environment variables
 */
function buildEnvironmentVariables(
  manifest: TerraAgentManifest,
  options: ConversionOptions
): EnvVar[] {
  const envVars: EnvVar[] = [];

  // Convert user environment variables
  if (manifest.spec.runtime.env) {
    for (const [name, value] of Object.entries(manifest.spec.runtime.env)) {
      // Check if it's a template reference
      if (value.startsWith('${') && value.endsWith('}')) {
        // Extract secret name from ${SECRET_NAME}
        const secretName = value.slice(2, -1).toLowerCase().replace(/_/g, '-');
        
        envVars.push({
          name,
          valueFrom: {
            secretKeyRef: {
              name: `terra-secrets-${secretName}`,
              key: name,
            },
          },
        });
      } else {
        // Plain value
        envVars.push({
          name,
          value,
        });
      }
    }
  }

  // Inject Terra platform environment variables
  envVars.push(
    {
      name: 'TERRA_AGENT_ID',
      value: options.agentId,
    },
    {
      name: 'TERRA_AGENT_NAME',
      value: manifest.metadata.name,
    },
    {
      name: 'TERRA_CLUSTER_ID',
      value: options.clusterId,
    },
    {
      name: 'OTEL_EXPORTER_OTLP_ENDPOINT',
      value: 'http://otel-collector.terra-system:4317',
    },
    {
      name: 'OTEL_SERVICE_NAME',
      value: `terra-agent-${manifest.metadata.name}`,
    }
  );

  // Add tenant ID if provided
  if (options.tenantId) {
    envVars.push({
      name: 'TERRA_TENANT_ID',
      value: options.tenantId,
    });
  }

  return envVars;
}

/**
 * Build Kubernetes resource requirements from Terra config.
 * 
 * Sets:
 * - requests: From deployment.resources (what the container needs)
 * - limits: From limits.resources (maximum the container can use)
 * 
 * @param manifest - Terra agent manifest
 * @returns Kubernetes resource requirements
 */
function buildResourceRequirements(
  manifest: TerraAgentManifest
): ResourceRequirements {
  const { deployment, limits } = manifest.spec;

  return {
    requests: {
      cpu: deployment.resources.cpu,
      memory: deployment.resources.memory,
    },
    limits: {
      cpu: limits.resources.maxCpu,
      memory: limits.resources.maxMemory,
    },
  };
}

/**
 * Build hardened container security context.
 * 
 * Security defaults:
 * - runAsNonRoot: true (cannot run as root)
 * - allowPrivilegeEscalation: false (cannot gain privileges)
 * - readOnlyRootFilesystem: false (allows writes to /tmp)
 * - capabilities.drop: ['ALL'] (drop all capabilities)
 * 
 * @returns Security context
 */
function buildSecurityContext() {
  return {
    runAsNonRoot: true,
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: false, // Allow writes to /tmp
    capabilities: {
      drop: ['ALL'],
    },
  };
}

/**
 * Build hardened pod security context.
 * 
 * Security defaults:
 * - fsGroup: 2000 (filesystem group ownership)
 * - runAsNonRoot: true (enforce non-root at pod level)
 * 
 * @returns Pod security context
 */
function buildPodSecurityContext() {
  return {
    fsGroup: 2000,
    runAsNonRoot: true,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate the generated Kagent CRD.
 * 
 * Performs basic sanity checks on the generated CRD.
 * More comprehensive validation should be done by Kagent.
 * 
 * @param crd - Generated Kagent CRD
 * @returns True if valid
 * @throws {Error} If validation fails
 */
export function validateKagentCRD(crd: KagentCRD): boolean {
  if (!crd.metadata.name) {
    throw new Error('CRD metadata.name is required');
  }

  if (!crd.metadata.namespace) {
    throw new Error('CRD metadata.namespace is required');
  }

  if (!crd.spec.byo.deployment.image) {
    throw new Error('CRD spec.byo.deployment.image is required');
  }

  if (crd.spec.byo.deployment.image.length < 1) {
    throw new Error('CRD spec.byo.deployment.image cannot be empty');
  }

  return true;
}