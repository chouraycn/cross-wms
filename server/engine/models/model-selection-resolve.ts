/**
 * 选择解析 — 模型选择的解析逻辑
 *
 * 根据各种输入参数解析出最终使用的模型，
 * 支持 agent 配置、环境变量、默认模型等多级回退。
 */

import { logger } from '../../logger.js';
import {
  parseModelRef,
  normalizeProviderId,
  normalizeModelId,
  type ModelRef,
} from './model-selection-normalize.js';
import { resolveConfiguredModelRef } from './model-selection-shared.js';

export interface ModelSelectionContext {
  agentId?: string;
  defaultModelId?: string;
  defaultProviderId?: string;
  configuredModels: Array<{ id: string; provider: string; enabled?: boolean }>;
  environmentModel?: string;
  environmentProvider?: string;
  agentModel?: string;
  agentProvider?: string;
}

export interface ResolvedModelSelection {
  modelId: string;
  providerId: string;
  source: 'explicit' | 'agent' | 'environment' | 'default' | 'fallback';
  resolvedFrom: string;
}

export interface ModelResolveOptions {
  preferConfigured?: boolean;
  fallbackToDefault?: boolean;
}

export function resolveModelSelection(
  explicitRef: string | ModelRef | undefined,
  context: ModelSelectionContext,
  options: ModelResolveOptions = {},
): ResolvedModelSelection {
  if (explicitRef) {
    const explicit = resolveExplicitRef(explicitRef, context, options);
    if (explicit) return explicit;
  }

  if (context.agentModel) {
    const agent = resolveFromAgent(context, options);
    if (agent) return agent;
  }

  if (context.environmentModel) {
    const env = resolveFromEnvironment(context, options);
    if (env) return env;
  }

  if (context.defaultModelId) {
    const defaultResult = resolveFromDefault(context, options);
    if (defaultResult) return defaultResult;
  }

  const firstConfigured = context.configuredModels.find(m => m.enabled !== false);
  if (firstConfigured) {
    return {
      modelId: firstConfigured.id,
      providerId: firstConfigured.provider,
      source: 'fallback',
      resolvedFrom: 'first-configured',
    };
  }

  throw new Error('No model available for selection');
}

function resolveExplicitRef(
  ref: string | ModelRef,
  context: ModelSelectionContext,
  options: ModelResolveOptions,
): ResolvedModelSelection | null {
  const parsed = typeof ref === 'string' ? parseModelRef(ref) : ref;

  if (options.preferConfigured && context.configuredModels.length > 0) {
    const configured = resolveConfiguredModelRef(
      parsed.modelId,
      context.configuredModels.filter(m => m.enabled !== false),
    );
    if (configured) {
      return {
        modelId: configured.modelId,
        providerId: configured.providerId,
        source: 'explicit',
        resolvedFrom: 'configured-explicit',
      };
    }
  }

  if (parsed.providerId && parsed.modelId) {
    return {
      modelId: parsed.modelId,
      providerId: normalizeProviderId(parsed.providerId),
      source: 'explicit',
      resolvedFrom: 'explicit-ref',
    };
  }

  if (parsed.modelId && context.defaultProviderId) {
    return {
      modelId: parsed.modelId,
      providerId: normalizeProviderId(context.defaultProviderId),
      source: 'explicit',
      resolvedFrom: 'explicit-model-with-default-provider',
    };
  }

  if (parsed.modelId) {
    const configured = resolveConfiguredModelRef(
      parsed.modelId,
      context.configuredModels,
    );
    if (configured) {
      return {
        modelId: configured.modelId,
        providerId: configured.providerId,
        source: 'explicit',
        resolvedFrom: 'explicit-model-resolved-from-config',
      };
    }
  }

  return null;
}

function resolveFromAgent(
  context: ModelSelectionContext,
  options: ModelResolveOptions,
): ResolvedModelSelection | null {
  if (!context.agentModel) return null;

  const parsed = parseModelRef(context.agentModel);

  if (parsed.providerId && parsed.modelId) {
    return {
      modelId: parsed.modelId,
      providerId: normalizeProviderId(parsed.providerId),
      source: 'agent',
      resolvedFrom: 'agent-config',
    };
  }

  if (parsed.modelId) {
    const provider = context.agentProvider || context.defaultProviderId;
    if (provider) {
      return {
        modelId: parsed.modelId,
        providerId: normalizeProviderId(provider),
        source: 'agent',
        resolvedFrom: 'agent-config',
      };
    }
  }

  return null;
}

function resolveFromEnvironment(
  context: ModelSelectionContext,
  _options: ModelResolveOptions,
): ResolvedModelSelection | null {
  if (!context.environmentModel) return null;

  const parsed = parseModelRef(context.environmentModel);

  if (parsed.providerId && parsed.modelId) {
    return {
      modelId: parsed.modelId,
      providerId: normalizeProviderId(parsed.providerId),
      source: 'environment',
      resolvedFrom: 'env-var',
    };
  }

  if (parsed.modelId) {
    const provider = context.environmentProvider || context.defaultProviderId;
    if (provider) {
      return {
        modelId: parsed.modelId,
        providerId: normalizeProviderId(provider),
        source: 'environment',
        resolvedFrom: 'env-var',
      };
    }
  }

  return null;
}

function resolveFromDefault(
  context: ModelSelectionContext,
  _options: ModelResolveOptions,
): ResolvedModelSelection | null {
  if (!context.defaultModelId) return null;

  const parsed = parseModelRef(context.defaultModelId);

  if (parsed.providerId && parsed.modelId) {
    return {
      modelId: parsed.modelId,
      providerId: normalizeProviderId(parsed.providerId),
      source: 'default',
      resolvedFrom: 'default-config',
    };
  }

  if (parsed.modelId && context.defaultProviderId) {
    return {
      modelId: parsed.modelId,
      providerId: normalizeProviderId(context.defaultProviderId),
      source: 'default',
      resolvedFrom: 'default-config',
    };
  }

  if (parsed.modelId) {
    const configured = resolveConfiguredModelRef(
      parsed.modelId,
      context.configuredModels,
    );
    if (configured) {
      return {
        modelId: configured.modelId,
        providerId: configured.providerId,
        source: 'default',
        resolvedFrom: 'default-config',
      };
    }
  }

  return null;
}

export function resolveModelWithFallback(
  preferredModel: string,
  fallbackModels: string[],
  context: ModelSelectionContext,
): ResolvedModelSelection | null {
  const allCandidates = [preferredModel, ...fallbackModels];

  for (const candidate of allCandidates) {
    try {
      const resolved = resolveModelSelection(candidate, context, {
        fallbackToDefault: false,
      });
      if (resolved) return resolved;
    } catch {
      continue;
    }
  }

  return null;
}

export function validateModelSelection(
  modelId: string,
  providerId: string,
  availableModels: Array<{ id: string; provider: string }>,
): boolean {
  const normModel = normalizeModelId(modelId);
  const normProvider = normalizeProviderId(providerId);

  return availableModels.some(
    m =>
      normalizeModelId(m.id) === normModel &&
      normalizeProviderId(m.provider) === normProvider,
  );
}
