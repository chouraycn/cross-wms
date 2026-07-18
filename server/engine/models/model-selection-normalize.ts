/**
 * 选择规范化 — 模型引用的规范化和解析
 *
 * 处理各种格式的模型引用，包括 provider/model 格式、
 * 别名映射、大小写规范化等。
 */

import { logger } from '../../logger.js';

export interface ModelRef {
  providerId?: string;
  modelId: string;
  authProfile?: string;
  original: string;
}

export interface ModelManifestNormalizationContext {
  defaultProvider?: string;
  providerAliases?: Record<string, string>;
  modelAliases?: Record<string, string>;
}

const PROVIDER_ALIASES: Record<string, string> = {
  'anthropic': 'anthropic',
  'claude': 'anthropic',
  'openai': 'openai',
  'azure': 'openai',
  'azure-openai': 'openai',
  'google': 'google',
  'gemini': 'google',
  'deepseek': 'deepseek',
  'groq': 'groq',
  'mistral': 'mistral',
  'cohere': 'cohere',
  'fireworks': 'fireworks',
  'fireworks-ai': 'fireworks',
  'deepinfra': 'deepinfra',
  'cerebras': 'cerebras',
  'nvidia': 'nvidia',
  'nvidia-nim': 'nvidia',
  'ollama': 'ollama',
  'litellm': 'litellm',
  'openrouter': 'openrouter',
  'qwen': 'qwen',
  'tongyi-qianwen': 'qwen',
  'zhipu': 'zhipu',
  'bigmodel': 'zhipu',
  'moonshot': 'moonshot',
  'kimi': 'moonshot',
  'minimax': 'minimax',
  'tencent': 'tencent',
  'hunyuan': 'tencent',
  'volcengine': 'volcengine',
  'doubao': 'volcengine',
  'xai': 'xai',
  'perplexity': 'perplexity',
  'together': 'together',
  'novita': 'novita',
  'siliconflow': 'siliconflow',
};

const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet': 'claude-3-5-sonnet',
  'claude-opus': 'claude-3-opus',
  'claude-haiku': 'claude-3-haiku',
  'gpt4': 'gpt-4',
  'gpt4o': 'gpt-4o',
  'gpt4o-mini': 'gpt-4o-mini',
  'gpt-4o_mini': 'gpt-4o-mini',
};

export function normalizeProviderId(provider: string): string {
  if (!provider) return '';
  const lower = provider.toLowerCase().trim();
  return PROVIDER_ALIASES[lower] || lower;
}

export function normalizeProviderIdForAuth(provider: string): string {
  return normalizeProviderId(provider);
}

export function normalizeModelId(modelId: string): string {
  if (!modelId) return '';
  const trimmed = modelId.trim();
  const lower = trimmed.toLowerCase();
  return MODEL_ALIASES[lower] || trimmed;
}

export function parseModelRef(ref: string): ModelRef {
  if (!ref || !ref.trim()) {
    return { modelId: '', original: ref };
  }

  const trimmed = ref.trim();
  const result: ModelRef = {
    modelId: trimmed,
    original: ref,
  };

  const slashIndex = trimmed.indexOf('/');
  if (slashIndex > 0) {
    result.providerId = normalizeProviderId(trimmed.slice(0, slashIndex));
    result.modelId = trimmed.slice(slashIndex + 1);
  }

  const colonIndex = result.modelId.lastIndexOf(':');
  if (colonIndex > 0 && result.modelId.length > colonIndex + 1) {
    const potentialProfile = result.modelId.slice(colonIndex + 1);
    if (isLikelyAuthProfile(potentialProfile)) {
      result.authProfile = potentialProfile;
      result.modelId = result.modelId.slice(0, colonIndex);
    }
  }

  result.modelId = normalizeModelId(result.modelId);

  return result;
}

function isLikelyAuthProfile(value: string): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  const profileKeywords = ['default', 'prod', 'staging', 'dev', 'test', 'personal', 'work', 'backup'];
  return profileKeywords.includes(lower) || /^profile[-_]?\d+$/i.test(value);
}

export function modelKey(providerId: string, modelId: string): string {
  return `${normalizeProviderId(providerId)}:${normalizeModelId(modelId)}`;
}

export function legacyModelKey(modelId: string): string {
  return normalizeModelId(modelId);
}

export function findNormalizedProviderKey(
  provider: string,
  context?: ModelManifestNormalizationContext,
): string | null {
  const normalized = normalizeProviderId(provider);

  if (context?.providerAliases) {
    for (const [key, value] of Object.entries(context.providerAliases)) {
      if (normalizeProviderId(key) === normalized || normalizeProviderId(value) === normalized) {
        return key;
      }
    }
  }

  return normalized || null;
}

export function findNormalizedProviderValue(
  provider: string,
  context?: ModelManifestNormalizationContext,
): string | null {
  const key = findNormalizedProviderKey(provider, context);
  if (!key) return null;
  return context?.providerAliases?.[key] || key;
}

export function normalizeModelRef(
  ref: string | ModelRef,
  context?: ModelManifestNormalizationContext,
): ModelRef {
  if (typeof ref === 'string') {
    ref = parseModelRef(ref);
  }

  const result: ModelRef = {
    ...ref,
    providerId: ref.providerId
      ? normalizeProviderId(ref.providerId)
      : context?.defaultProvider
        ? normalizeProviderId(context.defaultProvider)
        : undefined,
    modelId: normalizeModelId(ref.modelId),
  };

  if (context?.modelAliases && result.modelId) {
    const alias = context.modelAliases[result.modelId];
    if (alias) {
      result.modelId = alias;
    }
  }

  return result;
}

export function formatModelRef(ref: ModelRef): string {
  const parts: string[] = [];
  if (ref.providerId) parts.push(ref.providerId);
  parts.push(ref.modelId);
  if (ref.authProfile) parts.push(ref.authProfile);
  return parts.join('/');
}

export function isSameModelRef(a: string | ModelRef, b: string | ModelRef): boolean {
  const refA = typeof a === 'string' ? parseModelRef(a) : a;
  const refB = typeof b === 'string' ? parseModelRef(b) : b;

  if (refA.modelId !== refB.modelId) return false;
  if (refA.providerId && refB.providerId) {
    return refA.providerId === refB.providerId;
  }
  return true;
}

export function splitTrailingAuthProfile(modelRef: string): { model: string; profile?: string } {
  const colonIndex = modelRef.lastIndexOf(':');
  if (colonIndex <= 0) return { model: modelRef };

  const potentialProfile = modelRef.slice(colonIndex + 1);
  if (isLikelyAuthProfile(potentialProfile)) {
    return {
      model: modelRef.slice(0, colonIndex),
      profile: potentialProfile,
    };
  }

  return { model: modelRef };
}
