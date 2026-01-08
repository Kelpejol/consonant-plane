/**
 * src/manifest/types.ts
 * 
 * Comprehensive type definitions for Terra Agent and Kagent CRD manifests.
 * These types serve as the source of truth for both runtime validation (Zod)
 * and compile-time type checking (TypeScript).
 */

// ============================================================================
// TERRA AGENT TYPES
// ============================================================================

/**
 * Complete Terra Agent manifest structure
 * User-facing configuration for defining agents in the Terra platform
 */
export interface TerraAgentManifest {
  apiVersion: 'terra.dev/v1';
  kind: 'Agent';
  metadata: TerraAgentMetadata;
  spec: TerraAgentSpec;
}

/**
 * Agent metadata including name, labels, and annotations
 */
export interface TerraAgentMetadata {
  /** Unique name for the agent (DNS-1123 compliant) */
  name: string;
  /** Optional namespace (defaults to 'terra-agents') */
  namespace?: string;
  /** Key-value labels for organization and selection */
  labels?: Record<string, string>;
  /** Key-value annotations for additional metadata */
  annotations?: Record<string, string>;
}

/**
 * Complete agent specification
 */
export interface TerraAgentSpec {
  /** Optional human-readable description */
  description?: string;
  /** Runtime specifies the target runtime (kagent) */
  runtime: TerraRuntimeSpec;
  /** Deployment configuration */
  deployment: TerraDeploymentSpec;
  /** Resource limits and constraints */
  limits: TerraLimitsSpec;
  /** Optional agent capabilities */
  capabilities?: string[];
  /** Optional agent tools */
  tools?: TerraToolSpec[];
  /** Optional policies */
  policies?: TerraPoliciesSpec;
}

/**
 * Runtime configuration
 */
export interface TerraRuntimeSpec {
  /** Container image (required) */
  image: string;
  /** Optional entrypoint override */
  entrypoint?: string;
  /** Optional command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Deployment configuration
 */
export interface TerraDeploymentSpec {
  /** Resource requests and limits */
  resources: TerraResourcesSpec;
  /** Scaling configuration */
  scaling: TerraScalingSpec;
}

/**
 * Resource requests and limits
 */
export interface TerraResourcesSpec {
  /** CPU request (e.g., "250m", "1") */
  cpu: string;
  /** Memory request (e.g., "256Mi", "1Gi") */
  memory: string;
}

/**
 * Scaling configuration
 */
export interface TerraScalingSpec {
  /** Number of replicas */
  replicas: number;
}

/**
 * Resource limits and constraints
 */
export interface TerraLimitsSpec {
  /** Resource limits */
  resources: TerraResourceLimitsSpec;
  /** Scaling limits */
  scaling: TerraScalingLimitsSpec;
}

/**
 * Resource limits
 */
export interface TerraResourceLimitsSpec {
  /** Maximum CPU allocation */
  maxCpu: string;
  /** Maximum memory allocation */
  maxMemory: string;
}

/**
 * Scaling limits
 */
export interface TerraScalingLimitsSpec {
  /** Maximum number of replicas */
  maxReplicas: number;
}

/**
 * Tool specification
 */
export interface TerraToolSpec {
  /** Tool name */
  name: string;
  /** Optional tool description */
  description?: string;
  /** Optional tool configuration */
  config?: Record<string, any>;
}

/**
 * Policies specification
 */
export interface TerraPoliciesSpec {
  /** Approval requirements */
  approvals?: TerraApprovalsSpec;
}

/**
 * Approvals specification
 */
export interface TerraApprovalsSpec {
  /** Tools requiring approval */
  requiredFor?: string[];
}

// ============================================================================
// KAGENT CRD TYPES
// ============================================================================

/**
 * Complete Kagent CRD manifest structure
 * Internal representation for Kubernetes deployment
 */
export interface KagentCRD {
  apiVersion: 'kagent.dev/v1alpha2';
  kind: 'Agent';
  metadata: KagentMetadata;
  spec: KagentSpec;
}

/**
 * Kagent metadata
 */
export interface KagentMetadata {
  name: string;
  namespace: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/**
 * Kagent spec
 */
export interface KagentSpec {
  type: 'BYO';
  description?: string;
  byo: BYOAgentSpec;
}

/**
 * BYO Agent specification
 */
export interface BYOAgentSpec {
  deployment: ByoDeploymentSpec;
}

/**
 * BYO Deployment specification
 */
export interface ByoDeploymentSpec {
  // Required
  image: string;
  
  // Optional basic fields
  cmd?: string;
  args?: string[];
  replicas?: number;
  
  // Optional shared deployment fields
  imagePullSecrets?: LocalObjectReference[];
  volumes?: Volume[];
  volumeMounts?: VolumeMount[];
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  env?: EnvVar[];
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
  resources?: ResourceRequirements;
  tolerations?: Toleration[];
  affinity?: Affinity;
  nodeSelector?: Record<string, string>;
  securityContext?: SecurityContext;
  podSecurityContext?: PodSecurityContext;
}

// ============================================================================
// KUBERNETES TYPES (Subset)
// ============================================================================

export interface LocalObjectReference {
  name: string;
}

export interface Volume {
  name: string;
  configMap?: ConfigMapVolumeSource;
  secret?: SecretVolumeSource;
  emptyDir?: EmptyDirVolumeSource;
  [key: string]: any;
}

export interface ConfigMapVolumeSource {
  name: string;
  items?: KeyToPath[];
  defaultMode?: number;
}

export interface SecretVolumeSource {
  secretName: string;
  items?: KeyToPath[];
  defaultMode?: number;
}

export interface EmptyDirVolumeSource {
  medium?: string;
  sizeLimit?: string;
}

export interface KeyToPath {
  key: string;
  path: string;
  mode?: number;
}

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly?: boolean;
  subPath?: string;
}

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: EnvVarSource;
}

export interface EnvVarSource {
  secretKeyRef?: SecretKeySelector;
  configMapKeyRef?: ConfigMapKeySelector;
  fieldRef?: FieldSelector;
  resourceFieldRef?: ResourceFieldSelector;
}

export interface SecretKeySelector {
  name: string;
  key: string;
  optional?: boolean;
}

export interface ConfigMapKeySelector {
  name: string;
  key: string;
  optional?: boolean;
}

export interface FieldSelector {
  fieldPath: string;
  apiVersion?: string;
}

export interface ResourceFieldSelector {
  containerName?: string;
  resource: string;
  divisor?: string;
}

export interface ResourceRequirements {
  requests?: ResourceList;
  limits?: ResourceList;
}

export interface ResourceList {
  cpu?: string;
  memory?: string;
  [key: string]: string | undefined;
}

export interface Toleration {
  key?: string;
  operator?: 'Exists' | 'Equal';
  value?: string;
  effect?: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
  tolerationSeconds?: number;
}

export interface Affinity {
  nodeAffinity?: NodeAffinity;
  podAffinity?: PodAffinity;
  podAntiAffinity?: PodAntiAffinity;
}

export interface NodeAffinity {
  requiredDuringSchedulingIgnoredDuringExecution?: NodeSelector;
  preferredDuringSchedulingIgnoredDuringExecution?: PreferredSchedulingTerm[];
}

export interface NodeSelector {
  nodeSelectorTerms: NodeSelectorTerm[];
}

export interface NodeSelectorTerm {
  matchExpressions?: NodeSelectorRequirement[];
  matchFields?: NodeSelectorRequirement[];
}

export interface NodeSelectorRequirement {
  key: string;
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';
  values?: string[];
}

export interface PreferredSchedulingTerm {
  weight: number;
  preference: NodeSelectorTerm;
}

export interface PodAffinity {
  requiredDuringSchedulingIgnoredDuringExecution?: PodAffinityTerm[];
  preferredDuringSchedulingIgnoredDuringExecution?: WeightedPodAffinityTerm[];
}

export interface PodAntiAffinity {
  requiredDuringSchedulingIgnoredDuringExecution?: PodAffinityTerm[];
  preferredDuringSchedulingIgnoredDuringExecution?: WeightedPodAffinityTerm[];
}

export interface PodAffinityTerm {
  labelSelector?: LabelSelector;
  topologyKey: string;
  namespaces?: string[];
}

export interface WeightedPodAffinityTerm {
  weight: number;
  podAffinityTerm: PodAffinityTerm;
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: LabelSelectorRequirement[];
}

export interface LabelSelectorRequirement {
  key: string;
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
  values?: string[];
}

export interface SecurityContext {
  runAsUser?: number;
  runAsGroup?: number;
  runAsNonRoot?: boolean;
  readOnlyRootFilesystem?: boolean;
  allowPrivilegeEscalation?: boolean;
  capabilities?: Capabilities;
  seLinuxOptions?: SELinuxOptions;
  [key: string]: any;
}

export interface Capabilities {
  add?: string[];
  drop?: string[];
}

export interface SELinuxOptions {
  level?: string;
  role?: string;
  type?: string;
  user?: string;
}

export interface PodSecurityContext {
  fsGroup?: number;
  fsGroupChangePolicy?: 'OnRootMismatch' | 'Always';
  runAsUser?: number;
  runAsGroup?: number;
  runAsNonRoot?: boolean;
  seLinuxOptions?: SELinuxOptions;
  supplementalGroups?: number[];
  sysctls?: Sysctl[];
  [key: string]: any;
}

export interface Sysctl {
  name: string;
  value: string;
}

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

/**
 * Result of structural validation (Zod)
 */
export interface StructuralValidationResult {
  valid: boolean;
  data?: TerraAgentManifest;
  errors?: string[];
}

/**
 * Result of semantic validation
 */
export interface SemanticValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Combined validation result
 */
export interface AgentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Conversion result
 */
export interface ConversionResult {
  success: boolean;
  crd?: KagentCRD;
  error?: string;
}