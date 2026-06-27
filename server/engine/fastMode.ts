/**
 * Fast Mode — 快速模式自动降级模块
 *
 * 功能特性：
 * - 复杂任务 / 高延迟时自动降级到更快的模型
 * - 进度提示："⚡ Fast mode: thinking…"
 * - 可配置触发阈值（默认 10 秒无输出触发）
 * - 三档模型分级：premium / standard / fast
 * - 支持手动强制开启/关闭
 *
 * 集成思路：
 * 1. 在 agentRuntime 中，启动时根据模型 ID 判断初始档位
 * 2. 超过 autoTriggerSeconds 仍在 thinking 时，自动切换到 fast 档
 * 3. 切换时通过 onProgress 回调通知前端显示状态
 * 4. 下一轮对话自动恢复到原始模型配置
 */

import { logger } from '../logger.js';

// ==================== 类型定义 ====================

export type ModelTier = 'premium' | 'standard' | 'fast';

export interface FastModeConfig {
  enabled: boolean;
  autoTriggerSeconds: number;
  modelTiers: Record<ModelTier, string[]>;
  progressText: string;
}

export interface FastModeState {
  active: boolean;
  originalModelId: string;
  currentModelId: string;
  currentTier: ModelTier;
  triggeredAt?: number;
  reason?: 'auto' | 'manual';
}

export type FastModeProgressListener = (state: FastModeState) => void;

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: FastModeConfig = {
  enabled: true,
  autoTriggerSeconds: 10,
  modelTiers: {
    premium: [
      'gpt-5', 'gpt-5o', 'gpt-4.1', 'gpt-4o', 'claude-opus',
      'deepseek-v4-pro', 'glm-4.7', 'gemini-2.5-pro',
    ],
    standard: [
      'gpt-4o-mini', 'claude-sonnet', 'deepseek-v3',
      'glm-4-plus', 'gemini-2.0-flash', 'qwen-plus',
    ],
    fast: [
      'gpt-4o-mini-fast', 'claude-haiku', 'deepseek-chat',
      'glm-4-flash', 'gemini-1.5-flash', 'qwen-turbo',
    ],
  },
  progressText: '⚡ Fast mode: thinking…',
};

// ==================== 工具函数 ====================

function detectModelTier(modelId: string, tiers: Record<ModelTier, string[]>): ModelTier {
  const lowerId = modelId.toLowerCase().replace(/[-_]/g, '');
  for (const tier of (['premium', 'standard', 'fast'] as ModelTier[])) {
    for (const pattern of tiers[tier]) {
      const lowerPattern = pattern.toLowerCase().replace(/[-_]/g, '');
      if (lowerId.includes(lowerPattern) || lowerPattern.includes(lowerId)) {
        return tier;
      }
    }
  }
  return 'standard';
}

function pickNextTierModel(
  currentTier: ModelTier,
  tiers: Record<ModelTier, string[]>,
  availableModels: string[] = []
): string | null {
  const tierOrder: ModelTier[] = ['fast', 'standard', 'premium'];
  const currentIdx = tierOrder.indexOf(currentTier);
  if (currentIdx <= 0) return null;

  const nextTier = tierOrder[currentIdx - 1];
  const nextTierModels = tiers[nextTier];

  if (availableModels.length > 0) {
    for (const pattern of nextTierModels) {
      const match = availableModels.find((m) =>
        m.toLowerCase().includes(pattern.toLowerCase())
      );
      if (match) return match;
    }
  }

  return nextTierModels[0] || null;
}

// ==================== FastModeManager ====================

export class FastModeManager {
  private config: FastModeConfig;
  private state: FastModeState | null = null;
  private autoTriggerTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<FastModeProgressListener> = new Set();
  private availableModels: string[] = [];

  constructor(config?: Partial<FastModeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfig(config: Partial<FastModeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setAvailableModels(models: string[]): void {
    this.availableModels = models;
  }

  addProgressListener(listener: FastModeProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (!this.state) return;
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        logger.warn('[FastMode] 进度监听器出错:', e);
      }
    }
  }

  startSession(modelId: string): string {
    this.clearAutoTriggerTimer();
    const tier = detectModelTier(modelId, this.config.modelTiers);

    this.state = {
      active: false,
      originalModelId: modelId,
      currentModelId: modelId,
      currentTier: tier,
    };

    logger.debug(`[FastMode] 会话开始: model=${modelId}, tier=${tier}`);
    return modelId;
  }

  scheduleAutoTrigger(): void {
    if (!this.config.enabled) return;
    if (!this.state || this.state.active) return;
    if (this.state.currentTier === 'fast') return;

    this.clearAutoTriggerTimer();

    this.autoTriggerTimer = setTimeout(() => {
      this.triggerAuto();
    }, this.config.autoTriggerSeconds * 1000);

    logger.debug(`[FastMode] 自动触发已调度: ${this.config.autoTriggerSeconds}s 后`);
  }

  cancelAutoTrigger(): void {
    this.clearAutoTriggerTimer();
  }

  private clearAutoTriggerTimer(): void {
    if (this.autoTriggerTimer) {
      clearTimeout(this.autoTriggerTimer);
      this.autoTriggerTimer = null;
    }
  }

  triggerAuto(): boolean {
    if (!this.state || this.state.active) return false;
    if (this.state.currentTier === 'fast') return false;

    const fasterModel = pickNextTierModel(
      this.state.currentTier,
      this.config.modelTiers,
      this.availableModels
    );

    if (!fasterModel) {
      logger.debug('[FastMode] 无更快模型可用');
      return false;
    }

    const fasterTier = detectModelTier(fasterModel, this.config.modelTiers);

    this.state = {
      ...this.state,
      active: true,
      currentModelId: fasterModel,
      currentTier: fasterTier,
      triggeredAt: Date.now(),
      reason: 'auto',
    };

    logger.info(
      `[FastMode] 自动触发快速模式: ${this.state.originalModelId} → ${fasterModel}`
    );

    this.notifyListeners();
    return true;
  }

  triggerManual(modelId?: string): boolean {
    if (!this.state) return false;

    const targetModel = modelId || pickNextTierModel(
      this.state.currentTier,
      this.config.modelTiers,
      this.availableModels
    );

    if (!targetModel) return false;

    const targetTier = detectModelTier(targetModel, this.config.modelTiers);

    this.state = {
      ...this.state,
      active: true,
      currentModelId: targetModel,
      currentTier: targetTier,
      triggeredAt: Date.now(),
      reason: 'manual',
    };

    logger.info(`[FastMode] 手动触发快速模式: → ${targetModel}`);
    this.notifyListeners();
    return true;
  }

  getState(): FastModeState | null {
    return this.state;
  }

  isActive(): boolean {
    return this.state?.active ?? false;
  }

  getCurrentModelId(): string | null {
    return this.state?.currentModelId ?? null;
  }

  getProgressText(): string {
    return this.config.progressText;
  }

  endSession(): void {
    this.clearAutoTriggerTimer();
    this.state = null;
    logger.debug('[FastMode] 会话结束');
  }

  reset(): void {
    this.endSession();
    this.listeners.clear();
  }
}

// ==================== 单例导出 ====================

let defaultManager: FastModeManager | null = null;

export function getFastModeManager(): FastModeManager {
  if (!defaultManager) {
    defaultManager = new FastModeManager();
  }
  return defaultManager;
}

export function configureFastMode(config: Partial<FastModeConfig>): void {
  getFastModeManager().setConfig(config);
}
