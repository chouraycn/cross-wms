/**
 * 可见性策略 — 模型选择器的可见性策略
 *
 * 定义模型在选择器中是否可见的规则，
 * 包括按认证状态、能力、分类等过滤。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId } from './model-selection-normalize.js';

export type VisibilityPolicy =
  | 'all'
  | 'authenticated-only'
  | 'recommended-only'
  | 'enabled-only'
  | 'custom';

export interface VisibilityPolicyConfig {
  policy: VisibilityPolicy;
  hiddenProviders?: string[];
  hiddenModels?: string[];
  requiredCapabilities?: string[];
  showDeprecated?: boolean;
  showBeta?: boolean;
  maxModels?: number;
}

export interface VisibilityContext {
  userRole?: string;
  featureFlags?: string[];
  sessionType?: string;
}

const DEFAULT_POLICY: VisibilityPolicyConfig = {
  policy: 'all',
  showDeprecated: false,
  showBeta: true,
};

export function isModelVisible(
  model: {
    id: string;
    provider: string;
    enabled?: boolean;
    isRecommended?: boolean;
    isDeprecated?: boolean;
    isBeta?: boolean;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
    capabilities?: string[];
    hidden?: boolean;
  },
  config: VisibilityPolicyConfig = DEFAULT_POLICY,
  context: VisibilityContext = {},
): boolean {
  if (model.hidden) return false;

  if (config.hiddenModels?.includes(model.id)) return false;

  if (config.hiddenProviders?.includes(normalizeProviderId(model.provider))) {
    return false;
  }

  if (config.policy === 'recommended-only' && !model.isRecommended) {
    return false;
  }

  if (config.policy === 'enabled-only' && model.enabled === false) {
    return false;
  }

  if (config.policy === 'authenticated-only' && model.authStatus !== 'authenticated') {
    return false;
  }

  if (!config.showDeprecated && model.isDeprecated) {
    return false;
  }

  if (!config.showBeta && model.isBeta) {
    return false;
  }

  if (config.requiredCapabilities && config.requiredCapabilities.length > 0) {
    const modelCaps = model.capabilities ?? [];
    const hasAll = config.requiredCapabilities.every(cap =>
      modelCaps.includes(cap),
    );
    if (!hasAll) return false;
  }

  return true;
}

export function filterVisibleModels<T extends {
  id: string;
  provider: string;
  enabled?: boolean;
  isRecommended?: boolean;
  isDeprecated?: boolean;
  isBeta?: boolean;
  authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
  capabilities?: string[];
  hidden?: boolean;
}>(
  models: T[],
  config: VisibilityPolicyConfig = DEFAULT_POLICY,
  context: VisibilityContext = {},
): T[] {
  const filtered = models.filter(m => isModelVisible(m, config, context));

  if (config.maxModels && config.maxModels > 0 && filtered.length > config.maxModels) {
    return filtered.slice(0, config.maxModels);
  }

  return filtered;
}

export function isProviderVisible(
  providerId: string,
  config: VisibilityPolicyConfig = DEFAULT_POLICY,
  context: VisibilityContext = {},
): boolean {
  if (config.hiddenProviders?.includes(normalizeProviderId(providerId))) {
    return false;
  }
  return true;
}

export function mergeVisibilityPolicies(
  base: VisibilityPolicyConfig,
  override: Partial<VisibilityPolicyConfig>,
): VisibilityPolicyConfig {
  const result: VisibilityPolicyConfig = { ...base, ...override };

  if (base.hiddenProviders && override.hiddenProviders) {
    result.hiddenProviders = [...new Set([...base.hiddenProviders, ...override.hiddenProviders])];
  }

  if (base.hiddenModels && override.hiddenModels) {
    result.hiddenModels = [...new Set([...base.hiddenModels, ...override.hiddenModels])];
  }

  if (base.requiredCapabilities && override.requiredCapabilities) {
    result.requiredCapabilities = [...new Set([...base.requiredCapabilities, ...override.requiredCapabilities])];
  }

  return result;
}

export function createVisibilityPolicy(
  policy: VisibilityPolicy = 'all',
  overrides: Partial<VisibilityPolicyConfig> = {},
): VisibilityPolicyConfig {
  return mergeVisibilityPolicies({ ...DEFAULT_POLICY, policy }, overrides);
}

export function getVisibilityPolicySummary(config: VisibilityPolicyConfig): string {
  const parts: string[] = [`policy=${config.policy}`];
  if (config.hiddenProviders?.length) parts.push(`hiddenProviders=${config.hiddenProviders.length}`);
  if (config.hiddenModels?.length) parts.push(`hiddenModels=${config.hiddenModels.length}`);
  if (config.requiredCapabilities?.length) parts.push(`requiredCaps=${config.requiredCapabilities.length}`);
  if (config.maxModels) parts.push(`maxModels=${config.maxModels}`);
  return parts.join(', ');
}
