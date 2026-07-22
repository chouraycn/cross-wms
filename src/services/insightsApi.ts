/**
 * Insights API — 前端封装后端 /api/insights 端点
 *
 * 包含：
 * - 系统洞察（审计跟踪 / 通道健康 / LLM 成本 / 配置迁移 / 技能版本）
 * - 集成模块状态（LLM 熔断器 / 通道熔断器 / 技能依赖检查 / 权限策略加载器 / 配置引导）
 */

import { request } from './api';

// ============================================================================
// Types
// ============================================================================

export interface IntegrationStatus {
  llmInvoker: {
    module: 'llm-invoker';
    registeredCircuitBreakers: number;
    openCircuits: string[];
  };
  channelCircuitBreaker: {
    module: 'channel-circuit-breaker';
    boundToHealthMonitor: boolean;
    registeredBreakers: number;
    openCircuits: string[];
  };
  configBootstrap: {
    module: 'config-bootstrap';
    ready: boolean;
  };
  skillDependencyChecker: {
    module: 'skill-dependency-checker';
    lastCheckSummary?: {
      total: number;
      passed: number;
      failed: number;
      cycles: number;
    };
  };
  permissionPolicyLoader: {
    module: 'permission-policy-loader';
    loadedPolicies: number;
    availableTemplates: number;
  };
}

export interface LlmCircuitBreaker {
  provider: string;
  state: 'closed' | 'open' | 'half-open';
  snapshot: {
    failures: number;
    successes: number;
    lastFailure?: number;
    lastSuccess?: number;
    openedAt?: number;
  };
}

export interface ChannelCircuitBreaker {
  channelId: string;
  state: 'closed' | 'open' | 'half-open';
  snapshot: {
    failures: number;
    successes: number;
    lastFailure?: number;
    lastSuccess?: number;
    openedAt?: number;
    lastHealthStatus?: string;
  };
}

export interface SkillDependencyCheckSummary {
  total: number;
  passed: number;
  failed: number;
  globalCycles: string[][];
  loadOrder: string[];
  report?: string;
}

export interface PreInstallCheckResult {
  allowed: boolean;
  result: {
    valid: boolean;
    missing: Array<{ skill: string; required?: boolean; reason?: string }>;
    conflicts: Array<{ skill: string; reason: string }>;
    cycles: string[][];
  };
  report: string;
}

export interface PermissionPolicySummary {
  agentId: string;
  policy: {
    allowed: string[];
    denied: string[];
    requireApproval: string[];
  };
}

export interface PermissionTemplate {
  name: 'strict' | 'permissive' | 'readonly' | 'standard';
  definition: {
    allowed: string[];
    denied: string[];
    requireApproval: string[];
  };
}

export interface PolicyLoadResult {
  loaded: number;
  skipped: number;
  errors: Array<{ input: unknown; error: string }>;
  policies: PermissionPolicySummary[];
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  resolved: PermissionPolicySummary[];
}

export interface ConfigBootstrapResult {
  success: boolean;
  config: Record<string, unknown>;
  migration?: {
    fromVersion: number;
    toVersion: number;
    appliedMigrations: string[];
  };
  validation: {
    errorCount: number;
    errors: string[];
  };
  configPath: string;
  persisted: boolean;
  error?: string;
}

// ============================================================================
// Integration Status
// ============================================================================

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  return request<IntegrationStatus>('GET', '/api/insights/integration/status');
}

// ============================================================================
// LLM Circuit Breakers
// ============================================================================

export async function getLlmCircuitBreakers(): Promise<LlmCircuitBreaker[]> {
  return request<LlmCircuitBreaker[]>('GET', '/api/insights/llm/circuit-breakers');
}

export async function resetLlmCircuitBreakers(): Promise<{ cleared: boolean }> {
  return request<{ cleared: boolean }>('DELETE', '/api/insights/llm/circuit-breakers');
}

// ============================================================================
// Channel Circuit Breakers
// ============================================================================

export async function getChannelCircuitBreakers(): Promise<ChannelCircuitBreaker[]> {
  return request<ChannelCircuitBreaker[]>('GET', '/api/insights/channels/circuit-breakers');
}

export async function getOpenChannelCircuits(): Promise<string[]> {
  return request<string[]>('GET', '/api/insights/channels/circuit-breakers/open');
}

export async function syncChannelCircuitBreakers(): Promise<{ synced: boolean; breakers: number }> {
  return request<{ synced: boolean; breakers: number }>('POST', '/api/insights/channels/circuit-breakers/sync');
}

export async function resetChannelCircuitBreakers(): Promise<{ reset: boolean }> {
  return request<{ reset: boolean }>('DELETE', '/api/insights/channels/circuit-breakers');
}

// ============================================================================
// Skill Dependency Checker
// ============================================================================

export async function getRecentSkillDependencyCheck(): Promise<SkillDependencyCheckSummary> {
  return request<SkillDependencyCheckSummary>('GET', '/api/insights/skills/dependency-check/recent');
}

export async function runSkillDependencyCheck(entries: Array<{ skill: { name: string } }>): Promise<SkillDependencyCheckSummary> {
  return request<SkillDependencyCheckSummary>('POST', '/api/insights/skills/dependency-check', { entries });
}

export async function runPreInstallCheck(
  newEntry: { skill: { name: string } },
  existingEntries: Array<{ skill: { name: string } }>,
  options?: { allowOverride?: boolean; blockOnFailure?: boolean; checkCycles?: boolean; checkConflicts?: boolean },
): Promise<PreInstallCheckResult> {
  return request<PreInstallCheckResult>('POST', '/api/insights/skills/dependency-check/pre-install', {
    newEntry,
    existingEntries,
    options,
  });
}

// ============================================================================
// Permission Policy Loader
// ============================================================================

export async function getLoadedPolicies(): Promise<PermissionPolicySummary[]> {
  return request<PermissionPolicySummary[]>('GET', '/api/insights/permissions/policies');
}

export async function getPermissionTemplates(): Promise<PermissionTemplate[]> {
  return request<PermissionTemplate[]>('GET', '/api/insights/permissions/templates');
}

export async function loadPolicies(
  inputs: Array<{ agentId: string; template?: string; allowed?: string[]; denied?: string[]; requireApproval?: string[] }>,
  audit = true,
): Promise<PolicyLoadResult> {
  return request<PolicyLoadResult>('POST', '/api/insights/permissions/load', { inputs, audit });
}

export async function validatePolicies(
  inputs: Array<{ agentId: string; template?: string; allowed?: string[]; denied?: string[]; requireApproval?: string[] }>,
): Promise<PolicyValidationResult> {
  return request<PolicyValidationResult>('POST', '/api/insights/permissions/validate', { inputs });
}

export async function loadPoliciesFromFile(configPath: string): Promise<PolicyLoadResult> {
  return request<PolicyLoadResult>('POST', '/api/insights/permissions/load-from-file', { configPath });
}

// ============================================================================
// Config Bootstrap
// ============================================================================

export async function runConfigBootstrap(options: {
  configPath: string;
  failOnError?: boolean;
  persistAfterMigrate?: boolean;
  rollbackOnFailure?: boolean;
  backupDir?: string;
  createBackup?: boolean;
}): Promise<ConfigBootstrapResult> {
  return request<ConfigBootstrapResult>('POST', '/api/insights/config/bootstrap', options);
}