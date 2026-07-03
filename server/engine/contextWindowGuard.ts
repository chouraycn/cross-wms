/**
 * Context Window Guard — 上下文窗口守护模块
 *
 * 功能特性（基于 OpenClaw 架构增强）：
 * - 精确解析每个模型的上下文窗口大小
 * - 多层缓存机制：配置缓存 > 运行时发现缓存 > 模型元数据 > 默认值
 * - Anthropic GA 1M 模型特殊处理
 * - 硬最小值保护（4K tokens），低于此值拒绝执行
 * - 警告阈值（8K tokens），提前提示用户
 * - Token 预估和安全边际计算
 * - 自动触发压缩的阈值判断
 * - 异步缓存刷新支持
 * - 运行时状态追踪
 *
 * 优先级顺序：
 * 1. contextTokensOverride（运行时覆盖）
 * 2. MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE（配置缓存）
 * 3. MODEL_CONTEXT_TOKEN_CACHE（运行时发现缓存）
 * 4. 模型元数据
 * 5. 已知模型映射
 * 6. Provider 默认值
 * 7. 默认窗口
 *
 * 集成思路：
 * 1. 在 agentRuntime 开始时，获取当前模型的上下文窗口
 * 2. 每轮对话前预估 token 使用量
 * 3. 接近阈值时自动触发压缩
 * 4. 超硬上限时拒绝执行并提示用户
 */

import { logger } from '../logger.js';

// ==================== 常量 ====================

export const CONTEXT_WINDOW_HARD_MIN_TOKENS = 4_000;
export const CONTEXT_WINDOW_WARN_BELOW_TOKENS = 8_000;
export const CONTEXT_WINDOW_HARD_MIN_RATIO = 0.1;
export const CONTEXT_WINDOW_WARN_BELOW_RATIO = 0.2;

/** 默认的安全边际（预估 token 可能不准确，留出 20% 余量） */
export const DEFAULT_SAFETY_MARGIN = 1.2;

/** 触发自动压缩的使用比例（达到 70% 时触发） */
export const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.7;

/** 压缩目标比例（压缩到 50% 左右） */
export const DEFAULT_COMPACTION_TARGET_RATIO = 0.5;

/** Anthropic GA 1M 模型上下文窗口 */
export const ANTHROPIC_CONTEXT_1M_TOKENS = 1_048_576;
export const ANTHROPIC_VERTEX_CONTEXT_1M_TOKENS = 1_000_000;
export const ANTHROPIC_FABLE_CONTEXT_TOKENS = 1_000_000;

/** 缓存失效时间（5分钟） */
export const CACHE_EXPIRY_MS = 5 * 60 * 1000;

// ==================== 类型定义 ====================

export type ContextWindowSource = 'config' | 'model_metadata' | 'default' | 'agent_override' | 'discovery' | 'provider_default';

export interface ContextWindowInfo {
  totalTokens: number;
  referenceTokens?: number;
  source: ContextWindowSource;
  modelId: string;
  provider?: string;
}

export interface TokenUsageEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  safetyMarginTokens: number;
  safeTotalTokens: number;
  ratio: number;
  status: 'safe' | 'warning' | 'danger' | 'overflow';
}

export interface ContextGuardDecision {
  canProceed: boolean;
  reason?: string;
  suggestedAction?: 'none' | 'compact' | 'truncate' | 'switch_model';
  estimatedUsage?: TokenUsageEstimate;
}

export interface ContextTokenResolutionParams {
  provider?: string;
  model?: string;
  contextTokensOverride?: number;
  fallbackContextTokens?: number;
  modelContextWindow?: number;
  modelContextTokens?: number;
}

// ==================== 全局缓存（基于 OpenClaw 架构） ====================

export const MODEL_CONTEXT_TOKEN_CACHE = new Map<string, { tokens: number; timestamp: number }>();
export const MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE = new Map<string, { tokens: number; timestamp: number }>();
export const MODEL_CONTEXT_WINDOW_CACHE = new Map<string, { tokens: number; timestamp: number }>();

const PROVIDER_CONTEXT_TOKEN_CACHE_PREFIX = '\0provider:';

export function providerContextTokenCacheKey(provider: string, modelId: string): string {
  return `${PROVIDER_CONTEXT_TOKEN_CACHE_PREFIX}${provider}\0${modelId}`;
}

export function lookupCachedContextTokens(modelId?: string): number | undefined {
  if (!modelId) return undefined;
  const configured = MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE.get(modelId);
  if (configured && Date.now() - configured.timestamp < CACHE_EXPIRY_MS) {
    return configured.tokens;
  }
  const discovered = MODEL_CONTEXT_TOKEN_CACHE.get(modelId);
  if (discovered && Date.now() - discovered.timestamp < CACHE_EXPIRY_MS) {
    return discovered.tokens;
  }
  return undefined;
}

export function minPositiveContextTokens(...values: Array<number | undefined>): number | undefined {
  let result: number | undefined;
  for (const value of values) {
    if (typeof value !== 'number' || value <= 0) continue;
    result = result === undefined ? value : Math.min(result, value);
  }
  return result;
}

// ==================== 常见模型上下文窗口映射 ====================

const MODEL_CONTEXT_WINDOW_MAP: Record<string, number> = {
  'gpt-5': 200000,
  'gpt-5o': 200000,
  'gpt-4.1': 200000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16384,
  'claude-opus': 200000,
  'claude-sonnet': 200000,
  'claude-haiku': 200000,
  'deepseek-v4-pro': 128000,
  'deepseek-v3': 64000,
  'deepseek-chat': 32000,
  'glm-4.7': 128000,
  'glm-4-plus': 128000,
  'glm-4-flash': 128000,
  'gemini-2.5-pro': 1000000,
  'gemini-2.0-flash': 1000000,
  'gemini-1.5-flash': 1000000,
  'gemini-1.5-pro': 2000000,
  'qwen-plus': 128000,
  'qwen-turbo': 128000,
  'qwen-long': 1000000,
  'moonshot-v1-128k': 128000,
  'moonshot-v1-32k': 32768,
  'moonshot-v1-8k': 8192,
};

/** 通用模型 ID 前缀匹配（用于快速猜测） */
const PROVIDER_DEFAULT_WINDOW: Record<string, number> = {
  openai: 128000,
  anthropic: 200000,
  deepseek: 64000,
  zhipu: 128000,
  google: 128000,
  alibaba: 128000,
  moonshot: 64000,
  minimax: 24576,
  stepfun: 16384,
  baidu: 8192,
  tencent: 32768,
};

// ==================== 工具函数 ====================

function normalizeModelId(modelId: string): string {
  return modelId.toLowerCase().replace(/[-_]/g, '').replace(/\./g, '');
}

/**
 * 从已知模型映射中查找上下文窗口
 */
function lookupKnownModelWindow(modelId: string): number | null {
  const normalized = normalizeModelId(modelId);

  for (const [pattern, tokens] of Object.entries(MODEL_CONTEXT_WINDOW_MAP)) {
    const normalizedPattern = normalizeModelId(pattern);
    if (normalized.includes(normalizedPattern) || normalizedPattern.includes(normalized)) {
      return tokens;
    }
  }

  return null;
}

/**
 * 从 provider 推断默认上下文窗口
 */
function lookupProviderDefaultWindow(provider?: string): number | null {
  if (!provider) return null;
  const lowerProvider = provider.toLowerCase();

  for (const [pattern, tokens] of Object.entries(PROVIDER_DEFAULT_WINDOW)) {
    if (lowerProvider.includes(pattern)) {
      return tokens;
    }
  }

  return null;
}

/**
 * 粗略估算消息的 token 数
 * 简化版：中文按 1.5 chars/token，英文按 4 chars/token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let chineseChars = 0;
  let otherChars = 0;

  for (const ch of text) {
    if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      chineseChars++;
    } else {
      otherChars++;
    }
  }

  const chineseTokens = chineseChars / 1.5;
  const otherTokens = otherChars / 4;

  return Math.ceil(chineseTokens + otherTokens);
}

export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;
  for (const msg of messages) {
    total += 4;
    total += estimateTokens(msg.role);
    total += estimateTokens(msg.content || '');
  }
  total += 2;
  return total;
}

/** Anthropic GA 1M 模型前缀列表 */
const ANTHROPIC_GA_1M_MODEL_PREFIXES = [
  'claude-opus-4-8',
  'claude-opus-4.8',
  'claude-opus-4-6',
  'claude-opus-4.6',
  'claude-opus-4-7',
  'claude-opus-4.7',
  'claude-sonnet-4-6',
  'claude-sonnet-4.6',
];

function resolveAnthropicFixedContextWindow(modelId: string): number | undefined {
  const normalized = modelId.toLowerCase();
  for (const prefix of ANTHROPIC_GA_1M_MODEL_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return ANTHROPIC_CONTEXT_1M_TOKENS;
    }
  }
  return undefined;
}

function applyDiscoveredContextWindows(models: Array<{ id: string; provider?: string; contextWindow?: number; contextTokens?: number }>): void {
  const cacheMinimum = (key: string, contextTokens: number) => {
    const existing = MODEL_CONTEXT_TOKEN_CACHE.get(key);
    if (!existing || contextTokens < existing.tokens) {
      MODEL_CONTEXT_TOKEN_CACHE.set(key, { tokens: contextTokens, timestamp: Date.now() });
    }
  };

  for (const model of models) {
    if (!model?.id) continue;

    const discoveredContextTokens =
      typeof model.contextTokens === 'number'
        ? Math.trunc(model.contextTokens)
        : typeof model.contextWindow === 'number'
          ? Math.trunc(model.contextWindow)
          : undefined;

    const contextTokens =
      resolveAnthropicFixedContextWindow(model.id) ?? discoveredContextTokens;

    if (!contextTokens || contextTokens <= 0) continue;

    cacheMinimum(model.id, contextTokens);

    if (typeof model.provider === 'string') {
      const lowerProvider = model.provider.toLowerCase();
      cacheMinimum(providerContextTokenCacheKey(lowerProvider, model.id), contextTokens);

      const slash = model.id.indexOf('/');
      const prefixedProvider = slash > 0 ? model.id.slice(0, slash).toLowerCase() : '';
      const bareModelId = slash > 0 ? model.id.slice(slash + 1).trim() : '';

      if (prefixedProvider === lowerProvider && bareModelId) {
        cacheMinimum(providerContextTokenCacheKey(lowerProvider, bareModelId), contextTokens);
      }
    }
  }
}

// ==================== ContextWindowGuard ====================

export class ContextWindowGuard {
  private configOverrides: Map<string, number> = new Map();
  private modelMetadataCache: Map<string, { tokens: number; timestamp: number }> = new Map();
  private defaultWindow: number = 8192;
  private safetyMargin: number = DEFAULT_SAFETY_MARGIN;
  private compactionTriggerRatio: number = DEFAULT_COMPACTION_TRIGGER_RATIO;
  private compactionTargetRatio: number = DEFAULT_COMPACTION_TARGET_RATIO;

  constructor(options?: {
    defaultWindow?: number;
    safetyMargin?: number;
    compactionTriggerRatio?: number;
    compactionTargetRatio?: number;
  }) {
    if (options?.defaultWindow) this.defaultWindow = options.defaultWindow;
    if (options?.safetyMargin) this.safetyMargin = options.safetyMargin;
    if (options?.compactionTriggerRatio) this.compactionTriggerRatio = options.compactionTriggerRatio;
    if (options?.compactionTargetRatio) this.compactionTargetRatio = options.compactionTargetRatio;
  }

  setModelContextWindow(modelId: string, tokens: number): void {
    this.configOverrides.set(modelId, tokens);
    MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE.set(modelId, { tokens, timestamp: Date.now() });
    logger.debug(`[ContextGuard] 模型 ${modelId} 上下文窗口已配置: ${tokens}`);
  }

  setModelMetadata(modelId: string, tokens: number): void {
    this.modelMetadataCache.set(modelId, { tokens, timestamp: Date.now() });
    MODEL_CONTEXT_TOKEN_CACHE.set(modelId, { tokens, timestamp: Date.now() });
  }

  applyDiscoveredContextWindows(models: Array<{ id: string; provider?: string; contextWindow?: number; contextTokens?: number }>): void {
    applyDiscoveredContextWindows(models);
  }

  resolveContextTokens(params: ContextTokenResolutionParams): number {
    const { provider, model, contextTokensOverride, fallbackContextTokens } = params;

    if (contextTokensOverride !== undefined && contextTokensOverride > 0) {
      return contextTokensOverride;
    }

    if (model) {
      const cached = lookupCachedContextTokens(model);
      if (cached) return cached;

      const anthropicFixed = resolveAnthropicFixedContextWindow(model);
      if (anthropicFixed) return anthropicFixed;
    }

    if (provider && model) {
      const providerKey = providerContextTokenCacheKey(provider.toLowerCase(), model);
      const providerCached = MODEL_CONTEXT_TOKEN_CACHE.get(providerKey);
      if (providerCached && Date.now() - providerCached.timestamp < CACHE_EXPIRY_MS) {
        return providerCached.tokens;
      }
    }

    if (params.modelContextTokens !== undefined && params.modelContextTokens > 0) {
      return params.modelContextTokens;
    }

    if (params.modelContextWindow !== undefined && params.modelContextWindow > 0) {
      return params.modelContextWindow;
    }

    if (model) {
      const knownWindow = lookupKnownModelWindow(model);
      if (knownWindow) return knownWindow;
    }

    if (provider) {
      const providerDefault = lookupProviderDefaultWindow(provider);
      if (providerDefault) return providerDefault;
    }

    return fallbackContextTokens ?? 200_000;
  }

  getContextWindow(modelId: string, provider?: string): ContextWindowInfo {
    const configOverride = this.configOverrides.get(modelId);
    if (configOverride) {
      return {
        totalTokens: Math.max(configOverride, CONTEXT_WINDOW_HARD_MIN_TOKENS),
        source: 'config',
        modelId,
        provider,
      };
    }

    const cached = lookupCachedContextTokens(modelId);
    if (cached) {
      return {
        totalTokens: Math.max(cached, CONTEXT_WINDOW_HARD_MIN_TOKENS),
        source: 'discovery',
        modelId,
        provider,
      };
    }

    const anthropicFixed = resolveAnthropicFixedContextWindow(modelId);
    if (anthropicFixed) {
      return {
        totalTokens: anthropicFixed,
        source: 'discovery',
        modelId,
        provider,
      };
    }

    const metadata = this.modelMetadataCache.get(modelId);
    if (metadata) {
      return {
        totalTokens: Math.max(metadata.tokens, CONTEXT_WINDOW_HARD_MIN_TOKENS),
        source: 'model_metadata',
        modelId,
        provider,
      };
    }

    const knownWindow = lookupKnownModelWindow(modelId);
    if (knownWindow) {
      return {
        totalTokens: knownWindow,
        source: 'default',
        modelId,
        provider,
      };
    }

    const providerDefault = lookupProviderDefaultWindow(provider);
    if (providerDefault) {
      return {
        totalTokens: providerDefault,
        source: 'provider_default',
        modelId,
        provider,
      };
    }

    return {
      totalTokens: this.defaultWindow,
      source: 'default',
      modelId,
      provider,
    };
  }

  estimateUsage(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    provider?: string,
    estimatedOutputTokens: number = 1000
  ): TokenUsageEstimate {
    const window = this.getContextWindow(modelId, provider);
    const inputTokens = estimateMessagesTokens(messages);
    const totalTokens = inputTokens + estimatedOutputTokens;
    const safetyMarginTokens = Math.ceil(totalTokens * (this.safetyMargin - 1));
    const safeTotalTokens = totalTokens + safetyMarginTokens;
    const ratio = safeTotalTokens / window.totalTokens;

    let status: TokenUsageEstimate['status'] = 'safe';
    if (ratio >= 1) status = 'overflow';
    else if (ratio >= 0.9) status = 'danger';
    else if (ratio >= CONTEXT_WINDOW_WARN_BELOW_RATIO) status = 'warning';

    return {
      inputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens,
      safetyMarginTokens,
      safeTotalTokens,
      ratio,
      status,
    };
  }

  checkCanProceed(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    provider?: string,
    estimatedOutputTokens?: number
  ): ContextGuardDecision {
    const window = this.getContextWindow(modelId, provider);

    if (window.totalTokens < CONTEXT_WINDOW_HARD_MIN_TOKENS) {
      return {
        canProceed: false,
        reason: `模型 ${modelId} 上下文窗口过小 (${window.totalTokens} tokens)，低于最小值 ${CONTEXT_WINDOW_HARD_MIN_TOKENS}`,
        suggestedAction: 'switch_model',
      };
    }

    const usage = this.estimateUsage(modelId, messages, provider, estimatedOutputTokens);

    if (usage.status === 'overflow') {
      return {
        canProceed: false,
        reason: `上下文溢出: 预估 ${usage.safeTotalTokens} tokens / ${window.totalTokens} tokens (${(usage.ratio * 100).toFixed(1)}%)`,
        suggestedAction: 'compact',
        estimatedUsage: usage,
      };
    }

    if (usage.ratio >= this.compactionTriggerRatio) {
      return {
        canProceed: true,
        reason: `接近上下文上限: ${(usage.ratio * 100).toFixed(1)}%`,
        suggestedAction: 'compact',
        estimatedUsage: usage,
      };
    }

    if (usage.status === 'warning') {
      logger.debug(
        `[ContextGuard] 警告: ${modelId} 使用 ${(usage.ratio * 100).toFixed(1)}% 上下文窗口`
      );
    }

    return {
      canProceed: true,
      suggestedAction: 'none',
      estimatedUsage: usage,
    };
  }

  shouldCompact(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    provider?: string
  ): boolean {
    const decision = this.checkCanProceed(modelId, messages, provider);
    return decision.suggestedAction === 'compact';
  }

  getCompactionTargetTokens(modelId: string, provider?: string): number {
    const window = this.getContextWindow(modelId, provider);
    return Math.floor(window.totalTokens * this.compactionTargetRatio);
  }

  getWarningThreshold(modelId: string, provider?: string): number {
    const window = this.getContextWindow(modelId, provider);
    return Math.floor(window.totalTokens * CONTEXT_WINDOW_WARN_BELOW_RATIO);
  }

  clearCache(): void {
    this.modelMetadataCache.clear();
    MODEL_CONTEXT_TOKEN_CACHE.clear();
    MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE.clear();
    MODEL_CONTEXT_WINDOW_CACHE.clear();
    logger.debug('[ContextGuard] 所有缓存已清除');
  }

  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of MODEL_CONTEXT_TOKEN_CACHE.entries()) {
      if (now - entry.timestamp > CACHE_EXPIRY_MS) {
        MODEL_CONTEXT_TOKEN_CACHE.delete(key);
      }
    }
    for (const [key, entry] of MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE.entries()) {
      if (now - entry.timestamp > CACHE_EXPIRY_MS) {
        MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE.delete(key);
      }
    }
    for (const [key, entry] of MODEL_CONTEXT_WINDOW_CACHE.entries()) {
      if (now - entry.timestamp > CACHE_EXPIRY_MS) {
        MODEL_CONTEXT_WINDOW_CACHE.delete(key);
      }
    }
  }
}

// ==================== 单例 ====================

let defaultGuard: ContextWindowGuard | null = null;

export function getContextWindowGuard(): ContextWindowGuard {
  if (!defaultGuard) {
    defaultGuard = new ContextWindowGuard();
  }
  return defaultGuard;
}

// ANTHROPIC_CONTEXT_1M_TOKENS, ANTHROPIC_VERTEX_CONTEXT_1M_TOKENS, ANTHROPIC_FABLE_CONTEXT_TOKENS
// already exported at top of file with `export const`
