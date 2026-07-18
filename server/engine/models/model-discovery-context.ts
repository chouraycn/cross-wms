/**
 * 发现上下文 — 模型发现的上下文信息
 *
 * 管理模型发现过程中的上下文信息，包括
 * 环境、配置、能力要求等。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId } from './model-selection-normalize.js';

export interface DiscoveryContext {
  environment: 'development' | 'production' | 'test';
  sessionId?: string;
  agentId?: string;
  userId?: string;
  workspaceId?: string;
  requiredCapabilities: string[];
  preferredProviders?: string[];
  excludedProviders?: string[];
  preferredModels?: string[];
  excludedModels?: string[];
  minContextWindow?: number;
  maxCostPerMillion?: {
    input?: number;
    output?: number;
  };
  featureFlags?: string[];
  customFilters?: Record<string, unknown>;
}

export interface DiscoveryConstraints {
  requiredCapabilities: string[];
  minContextWindow: number;
  maxCost: number;
  allowedProviders: Set<string>;
  allowedModels: Set<string>;
}

export interface DiscoveryResult<T> {
  models: T[];
  context: DiscoveryContext;
  totalAvailable: number;
  totalFiltered: number;
  filterBreakdown: Record<string, number>;
}

const DEFAULT_CONTEXT: DiscoveryContext = {
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  requiredCapabilities: [],
};

export function createDiscoveryContext(
  overrides: Partial<DiscoveryContext> = {},
): DiscoveryContext {
  return {
    ...DEFAULT_CONTEXT,
    ...overrides,
    requiredCapabilities: overrides.requiredCapabilities ?? [],
    featureFlags: overrides.featureFlags ?? [],
  };
}

export function mergeDiscoveryContext(
  base: DiscoveryContext,
  overrides: Partial<DiscoveryContext>,
): DiscoveryContext {
  const result: DiscoveryContext = {
    ...base,
    ...overrides,
  };

  if (base.requiredCapabilities && overrides.requiredCapabilities) {
    result.requiredCapabilities = [...new Set([
      ...base.requiredCapabilities,
      ...overrides.requiredCapabilities,
    ])];
  }

  if (base.featureFlags && overrides.featureFlags) {
    result.featureFlags = [...new Set([...base.featureFlags, ...overrides.featureFlags])];
  }

  if (base.preferredProviders && overrides.preferredProviders) {
    result.preferredProviders = [...new Set([
      ...base.preferredProviders,
      ...overrides.preferredProviders,
    ])];
  }

  if (base.excludedProviders && overrides.excludedProviders) {
    result.excludedProviders = [...new Set([
      ...base.excludedProviders,
      ...overrides.excludedProviders,
    ])];
  }

  return result;
}

export function extractConstraints(context: DiscoveryContext): DiscoveryConstraints {
  return {
    requiredCapabilities: context.requiredCapabilities,
    minContextWindow: context.minContextWindow ?? 0,
    maxCost: context.maxCostPerMillion?.input ?? Infinity,
    allowedProviders: new Set(context.preferredProviders?.map(normalizeProviderId) ?? []),
    allowedModels: new Set(context.preferredModels ?? []),
  };
}

export function applyDiscoveryFilters<T extends {
  id: string;
  provider: string;
  capabilities?: string[];
  contextWindow?: number;
  pricing?: { inputPerMillion?: number; outputPerMillion?: number };
}>(
  models: T[],
  context: DiscoveryContext,
): DiscoveryResult<T> {
  const filterBreakdown: Record<string, number> = {};
  let current = [...models];

  if (context.excludedProviders && context.excludedProviders.length > 0) {
    const excluded = new Set(context.excludedProviders.map(normalizeProviderId));
    const before = current.length;
    current = current.filter(m => !excluded.has(normalizeProviderId(m.provider)));
    filterBreakdown['excludedProviders'] = before - current.length;
  }

  if (context.excludedModels && context.excludedModels.length > 0) {
    const excluded = new Set(context.excludedModels);
    const before = current.length;
    current = current.filter(m => !excluded.has(m.id));
    filterBreakdown['excludedModels'] = before - current.length;
  }

  if (context.requiredCapabilities && context.requiredCapabilities.length > 0) {
    const before = current.length;
    current = current.filter(m =>
      context.requiredCapabilities!.every(cap => m.capabilities?.includes(cap)),
    );
    filterBreakdown['requiredCapabilities'] = before - current.length;
  }

  if (context.minContextWindow && context.minContextWindow > 0) {
    const before = current.length;
    current = current.filter(m => (m.contextWindow ?? 0) >= context.minContextWindow!);
    filterBreakdown['minContextWindow'] = before - current.length;
  }

  if (context.maxCostPerMillion?.input) {
    const before = current.length;
    current = current.filter(m =>
      (m.pricing?.inputPerMillion ?? Infinity) <= context.maxCostPerMillion!.input!,
    );
    filterBreakdown['maxCost'] = before - current.length;
  }

  if (context.preferredProviders && context.preferredProviders.length > 0) {
    const preferred = new Set(context.preferredProviders.map(normalizeProviderId));
    current.sort((a, b) => {
      const aPref = preferred.has(normalizeProviderId(a.provider)) ? 0 : 1;
      const bPref = preferred.has(normalizeProviderId(b.provider)) ? 0 : 1;
      return aPref - bPref;
    });
  }

  logger.debug(`[DiscoveryContext] 过滤结果: ${models.length} → ${current.length} 个模型`);

  return {
    models: current,
    context,
    totalAvailable: models.length,
    totalFiltered: current.length,
    filterBreakdown,
  };
}

export function getDiscoveryContextSummary(context: DiscoveryContext): string {
  const parts: string[] = [`env=${context.environment}`];
  if (context.requiredCapabilities.length > 0) {
    parts.push(`caps=${context.requiredCapabilities.length}`);
  }
  if (context.preferredProviders?.length) {
    parts.push(`preferredProviders=${context.preferredProviders.length}`);
  }
  if (context.minContextWindow) {
    parts.push(`minCtx=${context.minContextWindow}`);
  }
  return parts.join(', ');
}
