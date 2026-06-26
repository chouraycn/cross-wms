/**
 * ModelFailover — 跨模型故障转移策略模块
 *
 * 支持两种故障转移策略：
 * - priority: 优先级列表，按预设顺序依次尝试模型
 * - capability-match: 按能力匹配，从具备所需能力的模型中按健康状态选择
 *
 * 维护模型健康状态（成功/失败计数、最后错误、冷却时间），
 * 失败的模型在冷却期后自动恢复，支持持久化状态。
 *
 * ============================================================
 * 与 aiClient.ts callAIModelStream 的集成思路：
 * ============================================================
 *
 * 1. 在 callAIModelStream 外层包装一层 failover 调用：
 *
 *    import { ModelFailoverManager } from './engine/modelFailover.js';
 *    import { loadModelsConfig } from './modelsStore.js';
 *
 *    const failoverManager = new ModelFailoverManager({
 *      maxFailuresBeforeCooldown: 3,
 *      cooldownMs: 5 * 60 * 1000, // 5 分钟冷却
 *      policy: 'priority',
 *    });
 *
 *    // 初始化时加载模型配置
 *    async function initFailover() {
 *      const config = await loadModelsConfig();
 *      failoverManager.setModels(config.models);
 *      // 设置优先级链（可选，不设置则按 models 数组顺序）
 *      failoverManager.setFallbackChain(['deepseek-v4-pro', 'glm-4.7', 'gpt-4o']);
 *    }
 *
 * 2. 在调用失败时使用 getNextModel 获取备选模型并重试：
 *
 *    export async function callAIModelWithFailover(
 *      modelConfig: ModelCallConfig,
 *      messages: any[],
 *      onChunk: (text: string) => void,
 *      options?: {
 *        signal?: AbortSignal;
 *        requiredCapabilities?: ModelCapability[];
 *        maxFailovers?: number;
 *      }
 *    ): Promise<AIResponse> {
 *      let currentModelId = modelConfig.id;
 *      let lastError: unknown;
 *      const maxAttempts = options?.maxFailovers ?? 3;
 *
 *      for (let attempt = 0; attempt < maxAttempts; attempt++) {
 *        try {
 *          const model = failoverManager.getModelById(currentModelId);
 *          if (!model) throw new Error(`Model ${currentModelId} not found`);
 *
 *          const result = await callAIModelStream(
 *            { ...modelConfig, id: model.id, apiEndpoint: model.apiEndpoint, apiKey: model.apiKey, provider: model.provider },
 *            messages,
 *            onChunk,
 *            options?.signal,
 *          );
 *
 *          failoverManager.recordSuccess(currentModelId);
 *          return result;
 *        } catch (error) {
 *          lastError = error;
 *          failoverManager.recordFailure(currentModelId, error);
 *
 *          const nextModel = failoverManager.getNextModel(
 *            currentModelId,
 *            error instanceof AIAPIError ? error.category : 'unknown',
 *            options?.requiredCapabilities,
 *          );
 *
 *          if (!nextModel) break;
 *          currentModelId = nextModel.id;
 *          logger.info(`[ModelFailover] 从 ${modelConfig.id} 切换到 ${currentModelId}`);
 *        }
 *      }
 *
 *      throw lastError;
 *    }
 *
 * 3. 错误分类映射：
 *    - auth / model_not_supported → 立即切换模型（不重试当前模型）
 *    - rate_limit / server / network / timeout → 先重试当前模型，再考虑切换
 *    - 可根据 errorCategory 在 getNextModel 中调整策略
 *
 * 4. 与 keyRotator 的关系：
 *    - keyRotator 负责同一模型内多 API Key 的轮询/故障转移
 *    - modelFailover 负责跨不同模型的故障转移
 *    - 两者是分层关系：先在模型内切 Key，Key 都失败后再切模型
 */

import type { ModelConfig, ModelCapability } from '../modelsStore.js';
import { logger } from '../logger.js';

/** 故障转移策略类型 */
export type FailoverPolicy = 'priority' | 'capability-match';

/** 错误分类，用于决定是否触发故障转移 */
export type ErrorCategory =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'timeout'
  | 'server'
  | 'model_not_supported'
  | 'unknown';

/** 模型健康状态 */
interface ModelHealthState {
  modelId: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastError?: string;
  lastErrorCategory?: ErrorCategory;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  isInCooldown: boolean;
  cooldownUntil?: number;
}

/** 持久化用的健康状态 */
interface PersistedModelHealth {
  modelId: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastError?: string;
  lastErrorCategory?: ErrorCategory;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  cooldownUntil?: number;
}

/** 持久化状态文件结构 */
interface PersistedFailoverState {
  version: 1;
  healthStates: Record<string, PersistedModelHealth>;
  savedAt: string;
}

/** ModelFailoverManager 配置选项 */
export interface ModelFailoverOptions {
  /** 连续失败多少次后进入冷却 */
  maxFailuresBeforeCooldown?: number;
  /** 冷却时间（毫秒） */
  cooldownMs?: number;
  /** 故障转移策略 */
  policy?: FailoverPolicy;
  /** 优先级 fallback 链（模型 ID 数组，按优先级从高到低） */
  fallbackChain?: string[];
  /** 状态持久化文件路径（可选，不设置则不持久化） */
  stateFilePath?: string;
}

/**
 * 模型故障转移管理器
 *
 * 维护模型健康状态，支持跨模型的自动故障转移。
 * 参考 OpenClaw failover-policy 模式实现。
 */
export class ModelFailoverManager {
  private models: ModelConfig[] = [];
  private healthStates = new Map<string, ModelHealthState>();
  private policy: FailoverPolicy;
  private maxFailuresBeforeCooldown: number;
  private cooldownMs: number;
  private fallbackChain: string[];
  private stateFilePath?: string;
  private saveIntervalId?: ReturnType<typeof setInterval>;

  /**
   * 创建模型故障转移管理器
   * @param options 配置选项
   */
  constructor(options: ModelFailoverOptions = {}) {
    this.policy = options.policy || 'priority';
    this.maxFailuresBeforeCooldown = options.maxFailuresBeforeCooldown ?? 3;
    this.cooldownMs = options.cooldownMs ?? 5 * 60 * 1000; // 默认 5 分钟
    this.fallbackChain = options.fallbackChain || [];
    this.stateFilePath = options.stateFilePath;

    if (this.stateFilePath) {
      this.loadState();
      this.startAutoSave();
    }
  }

  /**
   * 设置可用模型列表
   * @param models 模型配置数组
   */
  setModels(models: ModelConfig[]): void {
    this.models = models.filter(m => m.enabled !== false);
    for (const model of this.models) {
      if (!this.healthStates.has(model.id)) {
        this.healthStates.set(model.id, this.createInitialHealthState(model.id));
      }
    }
  }

  /**
   * 设置 fallback 优先级链
   * @param chain 模型 ID 数组，按优先级从高到低排列
   */
  setFallbackChain(chain: string[]): void {
    this.fallbackChain = chain;
  }

  /**
   * 设置故障转移策略
   * @param policy 策略类型
   */
  setPolicy(policy: FailoverPolicy): void {
    this.policy = policy;
  }

  /**
   * 根据 ID 获取模型配置
   * @param modelId 模型 ID
   * @returns 模型配置或 undefined
   */
  getModelById(modelId: string): ModelConfig | undefined {
    return this.models.find(m => m.id === modelId);
  }

  /**
   * 获取下一个备选模型
   *
   * @param currentModelId 当前失败的模型 ID
   * @param errorCategory 错误分类（用于决定切换策略）
   * @param requiredCapabilities 所需的模型能力（capability-match 策略使用）
   * @returns 下一个备选模型配置，没有可用模型时返回 null
   */
  getNextModel(
    currentModelId: string,
    errorCategory?: ErrorCategory,
    requiredCapabilities?: ModelCapability[],
  ): ModelConfig | null {
    this.refreshCooldownStates();

    const candidateModels = this.getCandidateModels(currentModelId, requiredCapabilities);
    if (candidateModels.length === 0) return null;

    const healthyModels = candidateModels.filter(m => this.isModelHealthy(m.id));
    if (healthyModels.length > 0) {
      return healthyModels[0];
    }

    const coolingModels = candidateModels.filter(m => {
      const state = this.healthStates.get(m.id);
      return state?.isInCooldown;
    });

    if (coolingModels.length > 0 && this.shouldForceRecover(errorCategory)) {
      const model = coolingModels[0];
      this.resetModelHealth(model.id);
      logger.debug(`[ModelFailover] 强制恢复冷却中的模型: ${model.id}`);
      return model;
    }

    return candidateModels[0] || null;
  }

  /**
   * 记录模型调用成功
   * @param modelId 模型 ID
   */
  recordSuccess(modelId: string): void {
    const state = this.getOrCreateHealthState(modelId);
    state.successCount++;
    state.consecutiveFailures = 0;
    state.lastSuccessAt = Date.now();
    state.isInCooldown = false;
    state.cooldownUntil = undefined;
    state.lastError = undefined;
    state.lastErrorCategory = undefined;
  }

  /**
   * 记录模型调用失败
   * @param modelId 模型 ID
   * @param error 错误对象或错误消息
   * @param errorCategory 错误分类
   */
  recordFailure(modelId: string, error: unknown, errorCategory?: ErrorCategory): void {
    const state = this.getOrCreateHealthState(modelId);
    state.failureCount++;
    state.consecutiveFailures++;
    state.lastFailureAt = Date.now();
    state.lastError = error instanceof Error ? error.message : String(error);
    state.lastErrorCategory = errorCategory || 'unknown';

    if (state.consecutiveFailures >= this.maxFailuresBeforeCooldown) {
      state.isInCooldown = true;
      state.cooldownUntil = Date.now() + this.cooldownMs;
      logger.warn(
        `[ModelFailover] 模型 ${modelId} 连续失败 ${state.consecutiveFailures} 次，` +
        `进入冷却 ${this.cooldownMs / 1000} 秒`,
      );
    }
  }

  /**
   * 获取模型健康状态
   * @param modelId 模型 ID
   * @returns 健康状态信息，模型不存在时返回 null
   */
  getModelHealth(modelId: string): {
    successCount: number;
    failureCount: number;
    consecutiveFailures: number;
    isInCooldown: boolean;
    cooldownRemainingMs: number;
    lastError?: string;
    lastErrorCategory?: ErrorCategory;
    lastSuccessAt?: number;
    lastFailureAt?: number;
  } | null {
    this.refreshCooldownStates();
    const state = this.healthStates.get(modelId);
    if (!state) return null;

    return {
      successCount: state.successCount,
      failureCount: state.failureCount,
      consecutiveFailures: state.consecutiveFailures,
      isInCooldown: state.isInCooldown,
      cooldownRemainingMs: state.cooldownUntil ? Math.max(0, state.cooldownUntil - Date.now()) : 0,
      lastError: state.lastError,
      lastErrorCategory: state.lastErrorCategory,
      lastSuccessAt: state.lastSuccessAt,
      lastFailureAt: state.lastFailureAt,
    };
  }

  /**
   * 获取所有模型的健康状态摘要
   * @returns 所有模型的健康状态数组
   */
  getAllHealthStatus(): Array<{
    modelId: string;
    modelName: string;
    isHealthy: boolean;
    isInCooldown: boolean;
    consecutiveFailures: number;
  }> {
    this.refreshCooldownStates();
    return this.models.map(model => {
      const state = this.healthStates.get(model.id);
      return {
        modelId: model.id,
        modelName: model.name,
        isHealthy: state ? this.isModelHealthy(model.id) : true,
        isInCooldown: state?.isInCooldown ?? false,
        consecutiveFailures: state?.consecutiveFailures ?? 0,
      };
    });
  }

  /**
   * 重置指定模型的健康状态
   * @param modelId 模型 ID
   */
  resetModelHealth(modelId: string): void {
    const state = this.healthStates.get(modelId);
    if (state) {
      state.consecutiveFailures = 0;
      state.isInCooldown = false;
      state.cooldownUntil = undefined;
      state.lastError = undefined;
      state.lastErrorCategory = undefined;
    }
  }

  /**
   * 重置所有模型的健康状态
   */
  resetAllHealth(): void {
    for (const modelId of this.healthStates.keys()) {
      this.resetModelHealth(modelId);
    }
    logger.info('[ModelFailover] 已重置所有模型健康状态');
  }

  /**
   * 手动将模型标记为冷却状态
   * @param modelId 模型 ID
   * @param durationMs 冷却时长（毫秒），不传则使用默认 cooldownMs
   */
  markModelForCooldown(modelId: string, durationMs?: number): void {
    const state = this.getOrCreateHealthState(modelId);
    state.isInCooldown = true;
    state.cooldownUntil = Date.now() + (durationMs ?? this.cooldownMs);
    state.consecutiveFailures = this.maxFailuresBeforeCooldown;
  }

  /**
   * 销毁管理器，清理定时器等资源
   */
  destroy(): void {
    if (this.saveIntervalId) {
      clearInterval(this.saveIntervalId);
      this.saveIntervalId = undefined;
    }
    if (this.stateFilePath) {
      this.saveState();
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 创建初始健康状态
   */
  private createInitialHealthState(modelId: string): ModelHealthState {
    return {
      modelId,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      isInCooldown: false,
    };
  }

  /**
   * 获取或创建健康状态
   */
  private getOrCreateHealthState(modelId: string): ModelHealthState {
    let state = this.healthStates.get(modelId);
    if (!state) {
      state = this.createInitialHealthState(modelId);
      this.healthStates.set(modelId, state);
    }
    return state;
  }

  /**
   * 刷新冷却状态（检查是否有模型冷却结束）
   */
  private refreshCooldownStates(): void {
    const now = Date.now();
    for (const state of this.healthStates.values()) {
      if (state.isInCooldown && state.cooldownUntil && now >= state.cooldownUntil) {
        state.isInCooldown = false;
        state.cooldownUntil = undefined;
        state.consecutiveFailures = 0;
        logger.debug(`[ModelFailover] 模型 ${state.modelId} 冷却结束，已恢复`);
      }
    }
  }

  /**
   * 判断模型是否健康（未冷却且失败次数未达阈值）
   */
  private isModelHealthy(modelId: string): boolean {
    const state = this.healthStates.get(modelId);
    if (!state) return true;
    if (state.isInCooldown) return false;
    return state.consecutiveFailures < this.maxFailuresBeforeCooldown;
  }

  /**
   * 根据策略获取候选模型列表（排除当前模型）
   */
  private getCandidateModels(
    currentModelId: string,
    requiredCapabilities?: ModelCapability[],
  ): ModelConfig[] {
    if (this.policy === 'capability-match' && requiredCapabilities && requiredCapabilities.length > 0) {
      return this.getCapabilityMatchedModels(currentModelId, requiredCapabilities);
    }
    return this.getPriorityModels(currentModelId);
  }

  /**
   * 按优先级策略获取候选模型
   */
  private getPriorityModels(currentModelId: string): ModelConfig[] {
    const result: ModelConfig[] = [];
    const addedIds = new Set<string>();

    if (this.fallbackChain.length > 0) {
      const currentIdx = this.fallbackChain.indexOf(currentModelId);
      const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
      for (let i = 0; i < this.fallbackChain.length; i++) {
        const idx = (startIdx + i) % this.fallbackChain.length;
        const modelId = this.fallbackChain[idx];
        if (modelId === currentModelId) continue;
        const model = this.models.find(m => m.id === modelId);
        if (model && !addedIds.has(model.id)) {
          result.push(model);
          addedIds.add(model.id);
        }
      }
    }

    for (const model of this.models) {
      if (model.id === currentModelId) continue;
      if (!addedIds.has(model.id)) {
        result.push(model);
        addedIds.add(model.id);
      }
    }

    return result;
  }

  /**
   * 按能力匹配策略获取候选模型
   */
  private getCapabilityMatchedModels(
    currentModelId: string,
    requiredCapabilities: ModelCapability[],
  ): ModelConfig[] {
    const matched = this.models.filter(model => {
      if (model.id === currentModelId) return false;
      if (!model.capabilities || model.capabilities.length === 0) return false;
      return requiredCapabilities.every(cap => (model.capabilities as string[]).includes(cap));
    });

    matched.sort((a, b) => {
      const stateA = this.healthStates.get(a.id);
      const stateB = this.healthStates.get(b.id);

      if (stateA?.isInCooldown && !stateB?.isInCooldown) return 1;
      if (!stateA?.isInCooldown && stateB?.isInCooldown) return -1;

      const failA = stateA?.consecutiveFailures ?? 0;
      const failB = stateB?.consecutiveFailures ?? 0;
      if (failA !== failB) return failA - failB;

      const succA = stateA?.successCount ?? 0;
      const succB = stateB?.successCount ?? 0;
      return succB - succA;
    });

    return matched;
  }

  /**
   * 判断是否应该强制恢复冷却中的模型
   * 当所有模型都在冷却中时，对于非致命错误可以强制恢复
   */
  private shouldForceRecover(errorCategory?: ErrorCategory): boolean {
    if (!errorCategory) return true;
    return !['auth', 'model_not_supported'].includes(errorCategory);
  }

  /**
   * 从文件加载持久化状态
   */
  private loadState(): void {
    if (!this.stateFilePath) return;
    try {
      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(this.stateFilePath)) return;

      const raw = fs.readFileSync(this.stateFilePath, 'utf-8').trim();
      if (!raw) return;

      const persisted: PersistedFailoverState = JSON.parse(raw);
      if (persisted.version !== 1) return;

      const now = Date.now();
      for (const [modelId, pState] of Object.entries(persisted.healthStates)) {
        const state: ModelHealthState = {
          ...pState,
          isInCooldown: !!(pState.cooldownUntil && pState.cooldownUntil > now),
        };
        this.healthStates.set(modelId, state);
      }

      logger.debug(`[ModelFailover] 已恢复 ${Object.keys(persisted.healthStates).length} 个模型的健康状态`);
    } catch (e) {
      logger.error('[ModelFailover] 加载持久化状态失败:', e);
    }
  }

  /**
   * 保存状态到文件
   */
  private saveState(): void {
    if (!this.stateFilePath) return;
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const healthStates: Record<string, PersistedModelHealth> = {};
      for (const [modelId, state] of this.healthStates) {
        healthStates[modelId] = {
          modelId: state.modelId,
          successCount: state.successCount,
          failureCount: state.failureCount,
          consecutiveFailures: state.consecutiveFailures,
          lastError: state.lastError,
          lastErrorCategory: state.lastErrorCategory,
          lastSuccessAt: state.lastSuccessAt,
          lastFailureAt: state.lastFailureAt,
          cooldownUntil: state.cooldownUntil,
        };
      }

      const persisted: PersistedFailoverState = {
        version: 1,
        healthStates,
        savedAt: new Date().toISOString(),
      };

      fs.writeFileSync(this.stateFilePath, JSON.stringify(persisted, null, 2), 'utf-8');
    } catch (e) {
      logger.error('[ModelFailover] 保存持久化状态失败:', e);
    }
  }

  /**
   * 启动自动保存定时器
   */
  private startAutoSave(): void {
    if (this.saveIntervalId) return;
    this.saveIntervalId = setInterval(() => this.saveState(), 30_000);
  }
}

let defaultManager: ModelFailoverManager | null = null;

/**
 * 获取默认的模型故障转移管理器单例
 * @param options 首次调用时的配置选项
 * @returns 全局单例 ModelFailoverManager
 */
export function getModelFailoverManager(options?: ModelFailoverOptions): ModelFailoverManager {
  if (!defaultManager) {
    defaultManager = new ModelFailoverManager(options);
  }
  return defaultManager;
}
