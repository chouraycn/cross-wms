/**
 * Compaction Config - 压缩配置系统
 *
 * 提供完整的压缩配置管理
 */
import type { CompactionIdentifierPolicy } from './compaction-identifier.js';

/** 压缩配置接口 */
export interface CompactionConfig {
  /** 是否启用压缩 */
  enabled: boolean;
  /** 超时毫秒数 */
  timeoutMs: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试最小延迟 */
  retryMinDelayMs: number;
  /** 重试最大延迟 */
  retryMaxDelayMs: number;
  /** 重试抖动比例 */
  retryJitter: number;
  /** 基础分块比例 */
  chunkRatio: number;
  /** 最小分块比例 */
  minChunkRatio: number;
  /** 安全系数 */
  safetyMargin: number;
  /** 摘要开销 */
  summarizationOverhead: number;
  /** 标识符保留策略 */
  identifierPolicy: CompactionIdentifierPolicy;
  /** 自定义标识符指令 */
  identifierInstructions?: string;
  /** 压缩后索引同步模式 */
  postIndexSync: 'off' | 'async' | 'await';
  /** 最小 prompt 预算 token */
  minPromptBudgetTokens: number;
  /** 最小 prompt 预算比例 */
  minPromptBudgetRatio: number;
  /** 启用工具对保护 */
  protectToolPairs: boolean;
  /** 启用重复消息去重 */
  deduplicateMessages: boolean;
  /** 压缩前消息数量阈值（超过则强制压缩） */
  forceCompressMessageCount: number;
}

/** 默认压缩配置 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  enabled: true,
  timeoutMs: 180_000, // 3 分钟
  maxRetries: 3,
  retryMinDelayMs: 500,
  retryMaxDelayMs: 5000,
  retryJitter: 0.2,
  chunkRatio: 0.4,
  minChunkRatio: 0.15,
  safetyMargin: 1.2,
  summarizationOverhead: 4096,
  identifierPolicy: 'strict',
  identifierInstructions: undefined,
  postIndexSync: 'async',
  minPromptBudgetTokens: 8000,
  minPromptBudgetRatio: 0.5,
  protectToolPairs: true,
  deduplicateMessages: true,
  forceCompressMessageCount: 80,
};

/** 压缩配置覆盖接口 */
export interface CompactionConfigOverrides {
  enabled?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  retryMinDelayMs?: number;
  retryMaxDelayMs?: number;
  retryJitter?: number;
  chunkRatio?: number;
  minChunkRatio?: number;
  safetyMargin?: number;
  summarizationOverhead?: number;
  identifierPolicy?: CompactionIdentifierPolicy;
  identifierInstructions?: string;
  postIndexSync?: 'off' | 'async' | 'await';
  minPromptBudgetTokens?: number;
  minPromptBudgetRatio?: number;
  protectToolPairs?: boolean;
  deduplicateMessages?: boolean;
  forceCompressMessageCount?: number;
}

/** 压缩配置验证错误 */
export interface CompactionConfigValidationError {
  field: string;
  message: string;
}

/**
 * 验证压缩配置
 */
export function validateCompactionConfig(
  config: Partial<CompactionConfig>,
): { valid: boolean; errors: CompactionConfigValidationError[] } {
  const errors: CompactionConfigValidationError[] = [];

  if (config.timeoutMs !== undefined) {
    if (config.timeoutMs < 1000) {
      errors.push({ field: 'timeoutMs', message: '超时必须 >= 1000ms' });
    }
    if (config.timeoutMs > 600_000) {
      errors.push({ field: 'timeoutMs', message: '超时不能超过 600000ms (10分钟)' });
    }
  }

  if (config.maxRetries !== undefined) {
    if (config.maxRetries < 0) {
      errors.push({ field: 'maxRetries', message: '重试次数不能为负' });
    }
    if (config.maxRetries > 10) {
      errors.push({ field: 'maxRetries', message: '重试次数不能超过 10' });
    }
  }

  if (config.chunkRatio !== undefined) {
    if (config.chunkRatio <= 0 || config.chunkRatio > 1) {
      errors.push({ field: 'chunkRatio', message: '分块比例必须在 (0, 1] 范围内' });
    }
  }

  if (config.minChunkRatio !== undefined) {
    if (config.minChunkRatio <= 0 || config.minChunkRatio > 1) {
      errors.push({ field: 'minChunkRatio', message: '最小分块比例必须在 (0, 1] 范围内' });
    }
  }

  if (config.chunkRatio !== undefined && config.minChunkRatio !== undefined) {
    if (config.minChunkRatio > config.chunkRatio) {
      errors.push({ field: 'minChunkRatio', message: '最小分块比例不能大于分块比例' });
    }
  }

  if (config.safetyMargin !== undefined) {
    if (config.safetyMargin < 1) {
      errors.push({ field: 'safetyMargin', message: '安全系数必须 >= 1' });
    }
    if (config.safetyMargin > 2) {
      errors.push({ field: 'safetyMargin', message: '安全系数不能超过 2' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 合并压缩配置
 */
export function mergeCompactionConfig(
  base: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
  overrides?: CompactionConfigOverrides,
): CompactionConfig {
  if (!overrides) {
    return { ...base };
  }

  // 验证覆盖配置
  const validation = validateCompactionConfig(overrides);
  if (!validation.valid) {
    const messages = validation.errors.map(e => e.message).join('; ');
    throw new Error(`Invalid compaction config overrides: ${messages}`);
  }

  return {
    ...base,
    ...overrides,
    // 确保对象引用正确
    identifierInstructions:
      overrides.identifierInstructions !== undefined
        ? overrides.identifierInstructions
        : base.identifierInstructions,
  };
}

/**
 * 从配置创建部分覆盖
 */
export function createConfigOverrides(
  partial: Partial<CompactionConfig>,
): CompactionConfigOverrides {
  return { ...partial };
}

/**
 * 编译配置为常量对象（用于热更新）
 */
export function compileConfigConstants(config: CompactionConfig): Record<string, unknown> {
  return {
    COMPACTION_ENABLED: config.enabled,
    COMPACTION_TIMEOUT_MS: config.timeoutMs,
    COMPACTION_MAX_RETRIES: config.maxRetries,
    COMPACTION_RETRY_MIN_DELAY_MS: config.retryMinDelayMs,
    COMPACTION_RETRY_MAX_DELAY_MS: config.retryMaxDelayMs,
    COMPACTION_RETRY_JITTER: config.retryJitter,
    COMPACTION_CHUNK_RATIO: config.chunkRatio,
    COMPACTION_MIN_CHUNK_RATIO: config.minChunkRatio,
    COMPACTION_SAFETY_MARGIN: config.safetyMargin,
    COMPACTION_SUMMARIZATION_OVERHEAD: config.summarizationOverhead,
    COMPACTION_IDENTIFIER_POLICY: config.identifierPolicy,
    COMPACTION_POST_INDEX_SYNC: config.postIndexSync,
    COMPACTION_MIN_PROMPT_BUDGET_TOKENS: config.minPromptBudgetTokens,
    COMPACTION_MIN_PROMPT_BUDGET_RATIO: config.minPromptBudgetRatio,
    COMPACTION_PROTECT_TOOL_PAIRS: config.protectToolPairs,
    COMPACTION_DEDUPLICATE_MESSAGES: config.deduplicateMessages,
    COMPACTION_FORCE_COMPRESS_MESSAGE_COUNT: config.forceCompressMessageCount,
  };
}

/**
 * 压缩配置管理器
 */
export class CompactionConfigManager {
  private config: CompactionConfig;

  constructor(config?: Partial<CompactionConfig>) {
    this.config = mergeCompactionConfig(DEFAULT_COMPACTION_CONFIG, config);
  }

  getConfig(): CompactionConfig {
    return { ...this.config };
  }

  updateConfig(overrides: CompactionConfigOverrides): void {
    this.config = mergeCompactionConfig(this.config, overrides);
  }

  reset(): void {
    this.config = { ...DEFAULT_COMPACTION_CONFIG };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getTimeout(): number {
    return this.config.timeoutMs;
  }

  getChunkRatio(contextWindow: number): number {
    return Math.max(
      this.config.minChunkRatio,
      Math.min(this.config.chunkRatio, contextWindow * this.config.chunkRatio),
    );
  }
}

/** 全局配置管理器实例 */
let globalConfigManager: CompactionConfigManager | null = null;

/**
 * 获取全局配置管理器
 */
export function getGlobalCompactionConfigManager(): CompactionConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new CompactionConfigManager();
  }
  return globalConfigManager;
}

/**
 * 设置全局配置管理器
 */
export function setGlobalCompactionConfigManager(manager: CompactionConfigManager): void {
  globalConfigManager = manager;
}
