/**
 * 模型运行时策略解析 — 参考 OpenClaw model-runtime-policy.ts
 *
 * 根据 agent 配置、模型目录、provider 配置解析出运行时策略。
 * 支持来源优先级：agent > model > provider > implicit
 */

import { logger } from '../logger.js';
import type { HarnessRuntime } from './harness/policy.js';

/** 策略来源 */
export type PolicySource = 'agent' | 'model' | 'provider' | 'implicit';

/** 运行时策略配置 */
export interface RuntimePolicyConfig {
  id: string;
  priority?: number;
  description?: string;
}

/** 解析后的模型运行时策略 */
export interface ResolvedModelRuntimePolicy {
  runtime: HarnessRuntime;
  policy?: RuntimePolicyConfig;
  source: PolicySource;
  matchedProvider?: string;
  modelId?: string;
  provider?: string;
}

/** 解析参数 */
export interface ResolveModelRuntimePolicyParams {
  agentId?: string;
  provider?: string;
  modelId?: string;
  sessionKey?: string;
  config?: Record<string, unknown>;
}

function hasRuntimePolicy(policy?: RuntimePolicyConfig): policy is RuntimePolicyConfig {
  return Boolean(policy?.id?.trim());
}

function normalizeProviderId(provider: string | undefined): string | undefined {
  if (!provider) return undefined;
  const lower = provider.toLowerCase().trim();
  const aliases: Record<string, string> = {
    'openai': 'openai',
    'azure': 'openai',
    'anthropic': 'anthropic',
    'claude': 'anthropic',
    'google': 'google',
    'gemini': 'google',
    'deepseek': 'deepseek',
    'qwen': 'qwen',
    'zhipu': 'zhipu',
    'moonshot': 'moonshot',
    'yi': 'yi',
    'baichuan': 'baichuan',
    'minimax': 'minimax',
    'ollama': 'ollama',
    'openrouter': 'openrouter',
    'siliconflow': 'siliconflow',
    'volcengine': 'volcengine',
    'doubao': 'doubao',
  };
  return aliases[lower] || lower;
}

function normalizeModelId(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  const trimmed = modelId.trim();
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex > 0) {
    return trimmed.slice(slashIndex + 1).trim() || undefined;
  }
  return trimmed;
}

function resolveProviderConfig(
  config: Record<string, unknown> | undefined,
  provider: string | undefined,
): Record<string, unknown> | undefined {
  if (!config || !provider?.trim()) {
    return undefined;
  }
  const models = config.models as Record<string, unknown> | undefined;
  if (!models?.providers) {
    return undefined;
  }
  const providers = models.providers as Record<string, unknown>;
  const direct = providers[provider];
  if (direct) {
    return direct as Record<string, unknown>;
  }
  const normalizedProvider = normalizeProviderId(provider);
  for (const [candidate, candidateConfig] of Object.entries(providers)) {
    if (normalizeProviderId(candidate) === normalizedProvider) {
      return candidateConfig as Record<string, unknown>;
    }
  }
  return undefined;
}

function resolveModelConfig(
  config: Record<string, unknown> | undefined,
  modelId: string | undefined,
): Record<string, unknown> | undefined {
  if (!config?.models || !modelId?.trim()) {
    return undefined;
  }
  const normalizedModelId = normalizeModelId(modelId);
  if (!normalizedModelId) return undefined;

  const models = config.models as Record<string, unknown>;

  if (models.entries) {
    const entries = models.entries as Record<string, unknown>;
    if (entries[normalizedModelId]) {
      return entries[normalizedModelId] as Record<string, unknown>;
    }
  }

  const providers = models.providers as Record<string, unknown>;
  for (const providerConfig of Object.values(providers)) {
    const provider = providerConfig as Record<string, unknown>;
    if (provider.models) {
      const providerModels = provider.models as Record<string, unknown>;
      if (providerModels[normalizedModelId]) {
        return providerModels[normalizedModelId] as Record<string, unknown>;
      }
    }
  }

  return undefined;
}

function resolveAgentConfig(
  config: Record<string, unknown> | undefined,
  agentId: string | undefined,
): Record<string, unknown> | undefined {
  if (!config?.agents || !agentId?.trim()) {
    return undefined;
  }
  const agents = config.agents as Record<string, unknown>;
  return agents[agentId] as Record<string, unknown>;
}

export function resolveModelRuntimePolicy(
  params: ResolveModelRuntimePolicyParams,
): ResolvedModelRuntimePolicy {
  const { agentId, provider, modelId, config } = params;

  if (agentId) {
    const agentConfig = resolveAgentConfig(config, agentId);
    if (agentConfig) {
      const runtimePolicy = extractRuntimePolicy(agentConfig);
      if (hasRuntimePolicy(runtimePolicy)) {
        logger.debug(`[ModelRuntimePolicy] 从 Agent 配置解析策略: ${agentId} → ${runtimePolicy.id}`);
        return {
          runtime: normalizeRuntime(runtimePolicy.id),
          policy: runtimePolicy,
          source: 'agent',
          matchedProvider: provider,
        };
      }
    }
  }

  if (modelId) {
    const modelConfig = resolveModelConfig(config, modelId);
    if (modelConfig) {
      const runtimePolicy = extractRuntimePolicy(modelConfig);
      if (hasRuntimePolicy(runtimePolicy)) {
        logger.debug(`[ModelRuntimePolicy] 从模型配置解析策略: ${modelId} → ${runtimePolicy.id}`);
        return {
          runtime: normalizeRuntime(runtimePolicy.id),
          policy: runtimePolicy,
          source: 'model',
          matchedProvider: provider,
        };
      }
    }
  }

  if (provider) {
    const providerConfig = resolveProviderConfig(config, provider);
    if (providerConfig) {
      const runtimePolicy = extractRuntimePolicy(providerConfig);
      if (hasRuntimePolicy(runtimePolicy)) {
        logger.debug(`[ModelRuntimePolicy] 从 Provider 配置解析策略: ${provider} → ${runtimePolicy.id}`);
        return {
          runtime: normalizeRuntime(runtimePolicy.id),
          policy: runtimePolicy,
          source: 'provider',
          matchedProvider: provider,
        };
      }

      const defaultRuntime = getDefaultRuntimeForProvider(provider);
      if (defaultRuntime) {
        logger.debug(`[ModelRuntimePolicy] 使用 Provider 默认: ${provider} → ${defaultRuntime}`);
        return {
          runtime: defaultRuntime,
          source: 'provider',
          matchedProvider: provider,
        };
      }
    }
  }

  logger.debug('[ModelRuntimePolicy] 使用隐式默认策略: auto');
  return {
    runtime: 'auto',
    source: 'implicit',
  };
}

function extractRuntimePolicy(config: Record<string, unknown>): RuntimePolicyConfig | undefined {
  if (config.runtime && typeof config.runtime === 'string') {
    return { id: config.runtime };
  }

  if (config.runtimePolicy && typeof config.runtimePolicy === 'object') {
    const policy = config.runtimePolicy as Record<string, unknown>;
    if (policy.id && typeof policy.id === 'string') {
      return {
        id: policy.id,
        priority: typeof policy.priority === 'number' ? policy.priority : undefined,
        description: typeof policy.description === 'string' ? policy.description : undefined,
      };
    }
  }

  if (config.agent && typeof config.agent === 'object') {
    const agent = config.agent as Record<string, unknown>;
    if (agent.runtime && typeof agent.runtime === 'string') {
      return { id: agent.runtime };
    }
  }

  return undefined;
}

function normalizeRuntime(runtimeId: string): HarnessRuntime {
  const lower = runtimeId.toLowerCase().trim();
  switch (lower) {
    case 'builtin':
    case 'embedded':
      return 'builtin';
    case 'codex':
      return 'codex';
    case 'custom':
      return 'custom';
    default:
      return 'auto';
  }
}

function getDefaultRuntimeForProvider(provider: string): HarnessRuntime | undefined {
  const normalized = normalizeProviderId(provider);
  if (!normalized) return undefined;
  return 'builtin';
}

export function needsAutoSelection(policy: ResolvedModelRuntimePolicy): boolean {
  return policy.runtime === 'auto';
}

export function getPolicySummary(policy: ResolvedModelRuntimePolicy): string {
  const parts = [`runtime=${policy.runtime}`];
  if (policy.source) parts.push(`source=${policy.source}`);
  if (policy.matchedProvider) parts.push(`provider=${policy.matchedProvider}`);
  if (policy.policy?.id) parts.push(`policy=${policy.policy.id}`);
  return parts.join(', ');
}