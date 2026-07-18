// 移植自 openclaw/src/config/model-input.ts
// 将模型输入配置规范化为 provider 和 model 引用。
//
// 降级说明：源文件依赖 @openclaw/model-catalog-core 的多个助手与
// @openclaw/normalization-core 的 string/record 助手，以及 ../shared/model-key.js。
// 此处内联等价实现。
import type { AgentModelConfig, AgentToolModelConfig } from './types/agents-shared.js';

/** 内联降级实现：规范化 provider id（小写去空白）。 */
function normalizeProviderId(id: string): string {
  return id.trim().toLowerCase();
}

/** 内联降级实现：规范化 Google 预览 model id（透传）。 */
function normalizeGooglePreviewModelId(id: string): string {
  return id;
}

/** 内联降级实现：规范化 Together model id（透传）。 */
function normalizeTogetherModelId(id: string): string {
  return id;
}

/** 内联降级实现：判断是否为普通记录对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 内联降级实现：将可选字符串值规范化（非空 trim 后字符串）。 */
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** 内联降级实现：从 string 或 {primary} 形态解析主字符串值。 */
function resolvePrimaryStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return normalizeOptionalString(value);
  }
  if (isRecord(value)) {
    return normalizeOptionalString(value.primary);
  }
  return undefined;
}

/** 内联降级实现：构造 provider/model 复合键。 */
function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

type AgentModelListLike = {
  primary?: string;
  fallbacks?: string[];
};

type AgentModelInput = AgentModelConfig | AgentToolModelConfig;

/** 从字符串或对象形态 agent model 配置返回主 model ref。 */
export function resolveAgentModelPrimaryValue(model?: AgentModelInput): string | undefined {
  return resolvePrimaryStringValue(model);
}

/** 返回已配置的 fallback model refs，保留其配置顺序。 */
export function resolveAgentModelFallbackValues(model?: AgentModelInput): string[] {
  if (!model || typeof model !== 'object') {
    return [];
  }
  return Array.isArray(model.fallbacks) ? model.fallbacks : [];
}

/** 返回向下取整为整毫秒的正有限 tool 超时。 */
export function resolveAgentModelTimeoutMsValue(model?: AgentToolModelConfig): number | undefined {
  if (!model || typeof model !== 'object') {
    return undefined;
  }
  return typeof model.timeoutMs === 'number' &&
    Number.isFinite(model.timeoutMs) &&
    model.timeoutMs > 0
    ? Math.floor(model.timeoutMs)
    : undefined;
}

/** 将遗留字符串 model 配置转换为 model patch 助手使用的对象形态。 */
export function toAgentModelListLike(model?: AgentModelConfig): AgentModelListLike | undefined {
  if (typeof model === 'string') {
    const primary = normalizeOptionalString(model);
    return primary ? { primary } : undefined;
  }
  if (!model || typeof model !== 'object') {
    return undefined;
  }
  return model;
}

const GOOGLE_PROVIDER_IDS = new Set(['google', 'google-gemini-cli', 'google-vertex']);

/** 在 provider/model refs 持久化到配置之前对其进行规范化。 */
export function normalizeAgentModelRefForConfig(model: string): string {
  const trimmed = model.trim();
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash >= trimmed.length - 1) {
    return trimmed;
  }

  const provider = normalizeProviderId(trimmed.slice(0, slash));
  const modelSuffix = trimmed.slice(slash + 1);
  const normalizedModel =
    GOOGLE_PROVIDER_IDS.has(provider) || modelSuffix.startsWith('google/')
      ? normalizeGooglePreviewModelId(modelSuffix)
      : provider === 'together'
        ? normalizeTogetherModelId(modelSuffix)
        : modelSuffix;
  return modelKey(provider, normalizedModel);
}

function mergeAgentModelEntryForConfig(existing: unknown, incoming: unknown): unknown {
  if (!isRecord(existing) || !isRecord(incoming)) {
    return incoming;
  }

  const existingParams = isRecord(existing.params) ? existing.params : undefined;
  const incomingParams = isRecord(incoming.params) ? incoming.params : undefined;
  return {
    ...existing,
    ...incoming,
    ...(existingParams || incomingParams
      ? { params: { ...existingParams, ...incomingParams } }
      : undefined),
  };
}

/** 规范化 model map 键，并合并坍缩为同一规范 ref 的条目。 */
export function normalizeAgentModelMapForConfig<T extends Record<string, unknown>>(models: T): T {
  let mutated = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(models)) {
    const normalizedKey = normalizeAgentModelRefForConfig(key);
    if (normalizedKey !== key || Object.hasOwn(next, normalizedKey)) {
      mutated = true;
    }
    // 后面的条目胜出，但嵌套 params 合并以免丢弃 provider 默认值。
    next[normalizedKey] = mergeAgentModelEntryForConfig(next[normalizedKey], entry);
  }
  return (mutated ? next : models) as T;
}
