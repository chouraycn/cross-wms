/**
 * Token Budget 预算管理 — 基于 OpenClaw 上下文预算系统
 *
 * 核心功能：
 * - 实时计算当前对话的 Token 用量
 * - 设置多级阈值：safe / warning / trigger / overflow
 * - 达到 trigger 阈值时自动触发压缩
 * - 支持模型上下文窗口自适应
 */

// ===================== 类型定义 =====================

/** Token 预算配置 */
export interface TokenBudgetConfig {
  /** 模型上下文窗口大小 */
  modelLimit: number;
  /** 警告阈值（比例，默认 0.8） */
  warningThreshold: number;
  /** 触发阈值（比例，默认 0.9） */
  triggerThreshold: number;
  /** 预留 Token 给回复（默认 4096） */
  reserveTokens: number;
}

/** Token 预算状态 */
export type TokenBudgetStatus = 'safe' | 'warning' | 'trigger' | 'overflow';

/** Token 预算快照 */
export interface TokenBudgetSnapshot {
  /** 当前使用的 Token 数 */
  currentTokens: number;
  /** 可用 Token 数 */
  availableTokens: number;
  /** 使用比例 */
  usageRatio: number;
  /** 当前状态 */
  status: TokenBudgetStatus;
  /** 模型限制 */
  modelLimit: number;
  /** 预留 Token */
  reserveTokens: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: TokenBudgetConfig = {
  modelLimit: 200000,
  warningThreshold: 0.8,
  triggerThreshold: 0.9,
  reserveTokens: 4096,
};

// ===================== TokenBudgetManager =====================

export class TokenBudgetManager {
  private config: TokenBudgetConfig;
  private currentTokens: number = 0;
  private onTriggerCallback?: (snapshot: TokenBudgetSnapshot) => void;

  constructor(config?: Partial<TokenBudgetConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 更新 Token 用量 */
  updateUsage(usage: { promptTokens?: number; completionTokens?: number; thinkingTokens?: number; totalTokens?: number }): void {
    if (usage.totalTokens !== undefined) {
      this.currentTokens = usage.totalTokens;
    } else {
      this.currentTokens = (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0) + (usage.thinkingTokens ?? 0);
    }

    // 检查是否达到触发阈值
    if (this.getStatus() === 'trigger' && this.onTriggerCallback) {
      this.onTriggerCallback(this.getSnapshot());
    }
  }

  /** 累加 Token 用量 */
  addUsage(delta: number): void {
    this.currentTokens += delta;
  }

  /** 获取当前状态 */
  getStatus(): TokenBudgetStatus {
    const effectiveLimit = this.config.modelLimit - this.config.reserveTokens;
    const ratio = this.currentTokens / effectiveLimit;

    if (ratio >= 1) return 'overflow';
    if (ratio >= this.config.triggerThreshold) return 'trigger';
    if (ratio >= this.config.warningThreshold) return 'warning';
    return 'safe';
  }

  /** 是否应该触发压缩 */
  shouldCompact(): boolean {
    return this.getStatus() === 'trigger' || this.getStatus() === 'overflow';
  }

  /** 获取快照 */
  getSnapshot(): TokenBudgetSnapshot {
    const effectiveLimit = this.config.modelLimit - this.config.reserveTokens;
    const status = this.getStatus();

    return {
      currentTokens: this.currentTokens,
      availableTokens: Math.max(0, effectiveLimit - this.currentTokens),
      usageRatio: this.currentTokens / effectiveLimit,
      status,
      modelLimit: this.config.modelLimit,
      reserveTokens: this.config.reserveTokens,
    };
  }

  /** 设置触发回调 */
  onTrigger(callback: (snapshot: TokenBudgetSnapshot) => void): void {
    this.onTriggerCallback = callback;
  }

  /** 重置 */
  reset(): void {
    this.currentTokens = 0;
  }

  /** 更新配置 */
  updateConfig(config: Partial<TokenBudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 获取配置 */
  getConfig(): Readonly<TokenBudgetConfig> {
    return this.config;
  }
}
