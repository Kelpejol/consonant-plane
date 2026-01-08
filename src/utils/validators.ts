/**
 * src/manifest/validators/terra-validator.ts
 * 
 * Semantic validation for Terra agent manifests.
 * Validates business logic constraints beyond structural validation.
 * 
 * Checks include:
 * - Deployment resources <= limit resources
 * - Tool references in policies exist
 * - Environment variable security (secrets use templates)
 * - Resource heuristics and warnings
 * 
 * @example
 * ```typescript
 * import { validateTerraSemantics } from './terra-validator';
 * 
 * const result = await validateTerraSemantics(manifest);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * if (result.warnings.length > 0) {
 *   console.warn('Warnings:', result.warnings);
 * }
 * ```
 */

import type { TerraAgentManifest } from '../schemas/agent.schema.js';


/**
 * Validation utilities
 */

import { z, type ZodSchema } from 'zod';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateOrThrow(
  schema: ZodSchema,
  data: unknown,
  context: string
) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(
      issue => `${issue.path.join('.') || 'root'}: ${issue.message}`
    );
    throw new ValidationError(
      `${context} validation failed:\n${errors.join('\n')}`,
      errors
    );
  }
  return result.data;
}

export function normalizeResourceQuantity(quantity: string): string {
  const trimmed = quantity.trim();
  
  if (trimmed.endsWith('m')) {
    return trimmed;
  } else if (!trimmed.match(/[a-zA-Z]/)) {
    const cores = parseFloat(trimmed);
    if (isNaN(cores)) {
      throw new ValidationError(`Invalid CPU quantity: ${quantity}`, [quantity]);
    }
    return `${Math.round(cores * 1000)}m`;
  }
  
  if (trimmed.endsWith('Mi')) {
    return trimmed;
  } else if (trimmed.endsWith('Gi')) {
    const gib = parseFloat(trimmed.slice(0, -2));
    if (isNaN(gib)) {
      throw new ValidationError(`Invalid memory quantity: ${quantity}`, [quantity]);
    }
    return `${Math.round(gib * 1024)}Mi`;
  }
  
  throw new ValidationError(`Unsupported resource format: ${quantity}`, [quantity]);
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of semantic validation
 * Contains errors (must fix) and warnings (should consider)
 */
export interface TerraSemanticValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;
  /** Critical errors that must be fixed */
  errors: string[];
  /** Non-critical warnings to consider */
  warnings: string[];
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Perform comprehensive semantic validation on a Terra agent manifest.
 * 
 * This function runs all semantic validation checks and returns
 * a combined result with all errors and warnings.
 * 
 * @param manifest - The Terra agent manifest to validate
 * @returns Validation result with errors and warnings
 */
export async function validateTerraSemantics(
  manifest: TerraAgentManifest
): Promise<TerraSemanticValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Run all validation checks
  errors.push(...validateDeploymentVsLimits(manifest));
  errors.push(...validateToolReferences(manifest));
  errors.push(...validateEnvironmentSecurity(manifest));
  warnings.push(...validateResourceHeuristics(manifest));
  warnings.push(...validateReplicaConfiguration(manifest));
  warnings.push(...validateImageConfiguration(manifest));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// RESOURCE VALIDATION
// ============================================================================

/**
 * Validate that deployment resources don't exceed limits.
 * 
 * Checks:
 * - deployment.resources.cpu <= limits.resources.maxCpu
 * - deployment.resources.memory <= limits.resources.maxMemory
 * - deployment.scaling.replicas <= limits.scaling.maxReplicas
 * 
 * @param manifest - Terra agent manifest
 * @returns Array of validation errors
 */
function validateDeploymentVsLimits(
  manifest: TerraAgentManifest
): string[] {
  const errors: string[] = [];
  const { deployment, limits } = manifest.spec;

  // Validate CPU
  const cpuRequest = parseResourceQuantity(deployment.resources.cpu);
  const cpuLimit = parseResourceQuantity(limits.resources.maxCpu);
  
  if (cpuRequest > cpuLimit) {
    errors.push(
      `deployment.resources.cpu (${deployment.resources.cpu}) exceeds ` +
      `limits.resources.maxCpu (${limits.resources.maxCpu})`
    );
  }

  // Validate Memory
  const memRequest = parseMemoryQuantity(deployment.resources.memory);
  const memLimit = parseMemoryQuantity(limits.resources.maxMemory);
  
  if (memRequest > memLimit) {
    errors.push(
      `deployment.resources.memory (${deployment.resources.memory}) exceeds ` +
      `limits.resources.maxMemory (${limits.resources.maxMemory})`
    );
  }

  // Validate Replicas
  if (deployment.scaling.replicas > limits.scaling.maxReplicas) {
    errors.push(
      `deployment.scaling.replicas (${deployment.scaling.replicas}) exceeds ` +
      `limits.scaling.maxReplicas (${limits.scaling.maxReplicas})`
    );
  }

  return errors;
}

/**
 * Generate warnings for resource configurations approaching limits.
 * 
 * Warns if resource usage is within 90% of limits.
 * 
 * @param manifest - Terra agent manifest
 * @returns Array of warnings
 */
function validateResourceHeuristics(
  manifest: TerraAgentManifest
): string[] {
  const warnings: string[] = [];
  const { deployment, limits } = manifest.spec;
  const THRESHOLD = 0.9; // 90%

  // Check CPU
  const cpuRequest = parseResourceQuantity(deployment.resources.cpu);
  const cpuLimit = parseResourceQuantity(limits.resources.maxCpu);
  const cpuPercentage = (cpuRequest / cpuLimit) * 100;
  
  if (cpuRequest > cpuLimit * THRESHOLD) {
    warnings.push(
      `CPU request is ${cpuPercentage.toFixed(1)}% of limit ` +
      `(${deployment.resources.cpu} / ${limits.resources.maxCpu})`
    );
  }

  // Check Memory
  const memRequest = parseMemoryQuantity(deployment.resources.memory);
  const memLimit = parseMemoryQuantity(limits.resources.maxMemory);
  const memPercentage = (memRequest / memLimit) * 100;
  
  if (memRequest > memLimit * THRESHOLD) {
    warnings.push(
      `Memory request is ${memPercentage.toFixed(1)}% of limit ` +
      `(${deployment.resources.memory} / ${limits.resources.maxMemory})`
    );
  }

  // Check Replicas
  const replicaPercentage = (deployment.scaling.replicas / limits.scaling.maxReplicas) * 100;
  
  if (deployment.scaling.replicas > limits.scaling.maxReplicas * THRESHOLD) {
    warnings.push(
      `Replica count is ${replicaPercentage.toFixed(1)}% of limit ` +
      `(${deployment.scaling.replicas} / ${limits.scaling.maxReplicas})`
    );
  }

  return warnings;
}

// ============================================================================
// TOOL AND POLICY VALIDATION
// ============================================================================

/**
 * Validate that policy tool references exist in the tools list.
 * 
 * Ensures that all tools referenced in policies.approvals.requiredFor
 * are actually defined in the tools array.
 * 
 * @param manifest - Terra agent manifest
 * @returns Array of validation errors
 */
function validateToolReferences(
  manifest: TerraAgentManifest
): string[] {
  const errors: string[] = [];
  
  // If no policies or no approval requirements, nothing to validate
  if (!manifest.spec.policies?.approvals?.requiredFor) {
    return errors;
  }

  // Get all defined tool names
  const definedTools = new Set(
    manifest.spec.tools?.map((tool) => tool.name) ?? []
  );

  // Check each referenced tool
  for (const toolName of manifest.spec.policies.approvals.requiredFor) {
    if (!definedTools.has(toolName)) {
      errors.push(
        `Policy references unknown tool: "${toolName}". ` +
        `Available tools: ${Array.from(definedTools).join(', ') || 'none'}`
      );
    }
  }

  // Check for duplicate tool names
  if (manifest.spec.tools) {
    const toolNames = manifest.spec.tools.map((t) => t.name);
    const duplicates = toolNames.filter(
      (name, index) => toolNames.indexOf(name) !== index
    );
    
    if (duplicates.length > 0) {
      errors.push(
        `Duplicate tool names found: ${[...new Set(duplicates)].join(', ')}`
      );
    }
  }

  return errors;
}

// ============================================================================
// ENVIRONMENT SECURITY VALIDATION
// ============================================================================

/**
 * Validate environment variable security practices.
 * 
 * Checks that sensitive environment variables use template syntax
 * for secret references rather than plain text values.
 * 
 * Sensitive patterns: SECRET, TOKEN, KEY, PASSWORD, APIKEY
 * 
 * @param manifest - Terra agent manifest
 * @returns Array of validation errors
 */
function validateEnvironmentSecurity(
  manifest: TerraAgentManifest
): string[] {
  const errors: string[] = [];
  const env = manifest.spec.runtime.env ?? {};

  // Patterns that indicate sensitive data
  const SENSITIVE_PATTERNS = /SECRET|TOKEN|KEY|PASSWORD|APIKEY|CREDENTIALS/i;
  
  // Valid template syntax: ${SECRET_NAME}
  const TEMPLATE_PATTERN = /^\$\{[A-Z_][A-Z0-9_]*\}$/;

  for (const [key, value] of Object.entries(env)) {
    // Check if the key suggests sensitive data
    if (SENSITIVE_PATTERNS.test(key)) {
      // Ensure it uses template syntax
      if (!value.startsWith('${')) {
        errors.push(
          `Sensitive environment variable "${key}" must use template syntax. ` +
          `Example: \${${key}}`
        );
      } else if (!TEMPLATE_PATTERN.test(value)) {
        errors.push(
          `Invalid template syntax for "${key}": ${value}. ` +
          `Expected format: \${VARIABLE_NAME}`
        );
      }
    }
    
    // If using template syntax, validate format
    if (value.startsWith('${') && !TEMPLATE_PATTERN.test(value)) {
      errors.push(
        `Invalid template syntax for "${key}": ${value}. ` +
        `Template must match: \${UPPERCASE_WITH_UNDERSCORES}`
      );
    }
  }

  return errors;
}

// ============================================================================
// CONFIGURATION WARNINGS
// ============================================================================

/**
 * Generate warnings for replica configuration.
 * 
 * @param manifest - Terra agent manifest
 * @returns Array of warnings
 */
function validateReplicaConfiguration(
  manifest: TerraAgentManifest
): string[] {
  const warnings: string[] = [];
  const replicas = manifest.spec.deployment.scaling.replicas;

  if (replicas === 1) {
    warnings.push(
      'Single replica deployment. Consider using 2+ replicas for high availability'
    );
  }

  if (replicas > 10) {
    warnings.push(
      `High replica count (${replicas}). Ensure this is intentional and resource limits are appropriate`
    );
  }

  return warnings;
}

/**
 * Generate warnings for container image configuration.
 * 
 * @param manifest - Terra agent manifest
 * @returns Array of warnings
 */
function validateImageConfiguration(
  manifest: TerraAgentManifest
): string[] {
  const warnings: string[] = [];
  const image = manifest.spec.runtime.image;

  // Warn if no tag specified (defaults to :latest)
  if (!image.includes(':') && !image.includes('@')) {
    warnings.push(
      `Image "${image}" has no tag. Consider specifying a version tag for reproducibility`
    );
  }

  // Warn if using :latest tag
  if (image.endsWith(':latest')) {
    warnings.push(
      `Image uses :latest tag. Consider using a specific version tag for reproducibility`
    );
  }

  return warnings;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse CPU resource quantity to millicores.
 * 
 * Supports:
 * - Millicores: "100m" -> 100
 * - Cores: "1" -> 1000, "0.5" -> 500
 * 
 * @param quantity - Resource quantity string
 * @returns Value in millicores
 */
function parseResourceQuantity(quantity: string): number {
  if (quantity.endsWith('m')) {
    return parseInt(quantity.slice(0, -1), 10);
  }
  return parseFloat(quantity) * 1000;
}

/**
 * Parse memory resource quantity to MiB.
 * 
 * Supports:
 * - MiB: "256Mi" -> 256
 * - GiB: "1Gi" -> 1024
 * - GB: "1G" -> ~953 (1000/1024 conversion)
 * 
 * @param quantity - Memory quantity string
 * @returns Value in MiB
 */
function parseMemoryQuantity(quantity: string): number {
  const match = quantity.match(/^(\d+\.?\d*|\d*\.?\d+)(Mi|Gi|M|G)?$/);
  
  if (!match) {
    throw new Error(`Invalid memory quantity: ${quantity}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || '';

  switch (unit) {
    case 'Mi':
      return value;
    case 'Gi':
      return value * 1024;
    case 'M':
      return value * (1000 / 1024); // Convert MB to MiB
    case 'G':
      return value * 1000 * (1000 / 1024); // Convert GB to MiB
    default:
      return value; // Assume MiB if no unit
  }
}

