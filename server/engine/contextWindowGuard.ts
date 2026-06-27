/**
 * Context Window Guard — 上下文窗口守护模块
 *
 * 功能特性：
 * - 精确解析每个模型的上下文窗口大小
 * - 配置 > 模型元数据 > 默认值 的优先级
 * - 硬最小值保护（4K tokens），低于此值拒绝执行
 * - 警告阈值（8K tokens），提前提示用户
 * - Token 预估和安全边际计算
 * - 自动触发压缩的阈值判断
 * - 多模型上下文窗口缓存
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

// ==================== 类型定义 ====================

export type ContextWindowSource = 'config' | 'model_metadata' | 'default' | 'agent_override';

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
    logger.debug(`[ContextGuard] 模型 ${modelId} 上下文窗口已配置: ${tokens}`);
  }

  setModelMetadata(modelId: string, tokens: number): void {
    this.modelMetadataCache.set(modelId, { tokens, timestamp: Date.now() });
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
        source: 'default',
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
    logger.debug('[ContextGuard] 缓存已清除');
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
