/**
 * BackoffCoordinator — 统一两层退避（限流/故障）决策中心
 *
 * 解决的问题：原系统中 keyRotator（同模型多 Key 轮询）与 ModelFailoverManager
 * （跨模型故障转移）是两套独立、互不感知的逻辑，未分层协作。本模块作为唯一决策入口，
 * 把「限流退避」与「模型降级」打通：
 *
 *   第一层（同模型 Key 层）：收到 429 / rate_limit 时，先在本模型内轮换到健康的备用 Key，
 *   并对失败 Key 做冷却（委托 keyRotator）。
 *
 *   第二层（跨模型降级层）：当同一模型连续命中限流达到阈值
 *   （RATE_LIMIT_MODEL_SWITCH_THRESHOLD，默认 2 次）后，判定本模型 Key 已耗尽，
 *   强制将该模型冷却并切换到备选模型（委托 ModelFailoverManager.getNextModel）。
 *
 * 设计要点：
 *   - 不引入新的全局状态源：直接复用 keyRotator 与 ModelFailoverManager 两个既有单例，
 *     仅在上层做「决策编排」，避免状态分裂。
 *   - coordinate() 永不抛错：任何异常都降级为「switch-model」或「give-up」，不阻断既有降级路径。
 *   - 退避时长通过 backoffMs 透出，由调用方决定是否 sleep（本模块不阻塞）。
 */

import type { ModelConfig, ModelCapability, ModelsFile } from '../modelsStore.js';
import { logger } from '../logger.js';
import { reportKeyResult, selectKey, getKeyStatus } from '../keyRotator.js';
import {
  getModelFailoverManager,
  type ErrorCategory,
  type ModelFailoverManager,
} from './modelFailover.js';
// v2.x: 复用统一的错误分类，消除 backoffCoordinator 与 aiClient 的规则不一致
import { classifyErrorFromObject } from './model-utils.js';

/** 连续限流多少次后，从「轮换 Key」升级为「跨模型降级」 */
const RATE_LIMIT_MODEL_SWITCH_THRESHOLD = 2;

/** 限流连续计数 TTL：超过此时长无新限流则重置（避免历史限流永久升级） */
const RATE_LIMIT_STREAK_TTL_MS = 5 * 60 * 1000;

/** 同模型轮换 Key 的建议退避（毫秒，由调用方决定是否等待） */
const KEY_ROTATE_BACKOFF_MS = 1000;

/** 跨模型降级重试的建议退避（毫秒） */
const MODEL_SWITCH_BACKOFF_MS = 500;

/** 限流导致的模型冷却时长（毫秒），覆盖 failover 默认 5 分钟 */
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;

/** 退避决策动作 */
export type BackoffAction = 'rotate-key' | 'switch-model' | 'give-up';

/** 统一退避决策结果 */
export interface BackoffDecision {
  action: BackoffAction;
  /** 决策所属层：key=同模型 Key 层；model=跨模型层 */
  layer: 'key' | 'model';
  /** 原始失败模型 ID */
  modelId: string;
  /** 建议退避时长（毫秒），由调用方决定是否 sleep */
  backoffMs: number;
  /** 轮换到的 Key 索引（action=rotate-key 时有效） */
  keyIndex?: number;
  /** 轮换到的 Key 值（action=rotate-key 时有效） */
  apiKey?: string;
  /** 降级到的目标模型 ID（action=switch-model 时有效） */
  nextModelId?: string;
  /** 降级到的目标模型名（action=switch-model 时有效） */
  nextModelName?: string;
  /** 决策原因（日志/可观测用） */
  reason: string;
  /** 当前模型连续限流次数（调试用） */
  rateLimitStreak?: number;
}

/** coordinate 入参 */
export interface CoordinateInput {
  /** 当前失败模型 ID */
  modelId: string;
  /** 当前失败模型配置（含多 Key，供 keyRotator 轮换） */
  modelConfig: ModelConfig;
  /** 本次失败所使用的 Key 索引（未使用 Key 时为 -1） */
  keyIndex: number;
  /** 失败错误 */
  error: unknown;
  /** 完整模型配置（用于解析降级目标的名称） */
  modelsConfig?: ModelsFile;
  /** 所需的模型能力（跨模型匹配时使用） */
  requiredCapabilities?: ModelCapability[];
}

/**
 * 从错误中推断错误分类。
 *
 * v2.x: 委托到共享的 model-utils.classifyErrorFromObject，消除三套重复实现。
 * 保留此包装函数以兼容已有调用方（如有）。
 */
function classifyErrorCategory(error: unknown): ErrorCategory {
  return classifyErrorFromObject(error);
}

/**
 * BackoffCoordinator — 两层退避的统一决策器。
 *
 * 两个单例（keyRotator 模块级状态、ModelFailoverManager 全局单例）被本类编排。
 */
export class BackoffCoordinator {
  private readonly failoverManager: ModelFailoverManager;
  /** 每模型的连续限流计数 */
  private readonly rateLimitStreak = new Map<string, { count: number; firstAt: number }>();

  constructor(failoverManager?: ModelFailoverManager) {
    this.failoverManager = failoverManager ?? getModelFailoverManager();
  }

  /**
   * 记录一次成功调用：重置该模型的限流计数，并上报 Key / 模型健康。
   */
  recordSuccess(modelId: string, keyIndex?: number): void {
    if (keyIndex !== undefined && keyIndex >= 0) {
      reportKeyResult(modelId, keyIndex, true);
    }
    this.resetStreak(modelId);
    this.failoverManager.recordSuccess(modelId);
  }

  /**
   * 统一决策：给定一次失败的 (模型, Key, 错误)，返回下一步动作。
   *
   * 流程：
   *   1. 分类错误；上报 Key 失败（冷却）+ 模型失败。
   *   2. 若为限流：
   *      a. 连续限流未达阈值 且 本模型有其它健康 Key → rotate-key（同模型层）。
   *      b. 达阈值 或 无可轮换 Key → 冷却本模型并 switch-model（跨模型层）。
   *   3. 非限流错误 → 直接走跨模型层（由 failoverManager 决定）。
   */
  coordinate(input: CoordinateInput): BackoffDecision {
    const { modelId, modelConfig, keyIndex, error, modelsConfig, requiredCapabilities } = input;
    try {
      const category = classifyErrorCategory(error);

      // 上报失败：冷却失败 Key + 记录模型失败
      if (keyIndex >= 0) {
        reportKeyResult(modelId, keyIndex, false);
      }
      this.failoverManager.recordFailure(modelId, error, category);

      // 确保 failover 管理器持有最新模型列表（幂等）
      if (modelsConfig) {
        this.failoverManager.setModels(modelsConfig.models);
      }

      if (category === 'rate_limit') {
        const streak = this.bumpStreak(modelId);
        const canRotate = this.canRotateKey(modelId, keyIndex);

        if (streak < RATE_LIMIT_MODEL_SWITCH_THRESHOLD && canRotate) {
          const next = selectKey(modelConfig);
          if (next && next.index !== keyIndex) {
            logger.info(
              `[BackoffCoordinator] 模型 ${modelId} 限流 #${streak}，同模型轮换 Key → Key#${next.index}` +
              `（未达跨模型阈值 ${RATE_LIMIT_MODEL_SWITCH_THRESHOLD}）`,
            );
            return {
              action: 'rotate-key',
              layer: 'key',
              modelId,
              keyIndex: next.index,
              apiKey: next.key,
              backoffMs: KEY_ROTATE_BACKOFF_MS,
              reason: `限流 #${streak}，同模型轮换 Key`,
              rateLimitStreak: streak,
            };
          }
        }

        // 达阈值或无可轮换 Key → 跨模型降级
        logger.warn(
          `[BackoffCoordinator] 模型 ${modelId} 连续限流 ${streak} 次，升级为跨模型降级`,
        );
        return this.switchModel(modelId, 'rate_limit', requiredCapabilities, modelsConfig, streak);
      }

      // 非限流错误：仅对「原本可恢复」的错误类型做跨模型降级，
      // auth / unknown 等保持不降级（与历史 tryFallback 行为一致，避免误切模型）。
      const RECOVERABLE = ['model_not_supported', 'timeout', 'network', 'server'];
      if (!RECOVERABLE.includes(category)) {
        return {
          action: 'give-up',
          layer: 'model',
          modelId,
          backoffMs: 0,
          reason: `不可恢复错误类型: ${category}`,
          rateLimitStreak: 0,
        };
      }
      return this.switchModel(modelId, category, requiredCapabilities, modelsConfig, 0);
    } catch (e) {
      logger.error('[BackoffCoordinator] 决策异常，回退到 give-up:', e);
      return {
        action: 'give-up',
        layer: 'model',
        modelId,
        backoffMs: 0,
        reason: 'coordinator 内部异常',
      };
    }
  }

  // ===================== 私有方法 =====================

  /** 判断模型是否还有可轮换的健康 Key（排除刚失败的 Key） */
  private canRotateKey(modelId: string, failedKeyIndex: number): boolean {
    const status = getKeyStatus(modelId);
    if (!status) return false;
    // 多个 Key 且存在非失败 Key 即认为可轮换（冷却由 selectKey 内部处理）
    const otherKeys = status.filter((k) => k.index !== failedKeyIndex);
    return otherKeys.length > 0;
  }

  /** 递增并返回该模型的连续限流计数（带 TTL 重置） */
  private bumpStreak(modelId: string): number {
    const now = Date.now();
    const prev = this.rateLimitStreak.get(modelId);
    if (prev && now - prev.firstAt <= RATE_LIMIT_STREAK_TTL_MS) {
      prev.count += 1;
      return prev.count;
    }
    this.rateLimitStreak.set(modelId, { count: 1, firstAt: now });
    return 1;
  }

  /** 重置限流计数 */
  private resetStreak(modelId: string): void {
    this.rateLimitStreak.delete(modelId);
  }

  /** 跨模型降级决策：冷却本模型 → 选取备选模型 */
  private switchModel(
    modelId: string,
    category: ErrorCategory,
    requiredCapabilities: ModelCapability[] | undefined,
    modelsConfig: ModelsFile | undefined,
    streak: number,
  ): BackoffDecision {
    this.resetStreak(modelId);
    this.failoverManager.markModelForCooldown(modelId, RATE_LIMIT_COOLDOWN_MS);

    const next = this.failoverManager.getNextModel(modelId, category, requiredCapabilities);
    if (!next || next.id === modelId) {
      return {
        action: 'give-up',
        layer: 'model',
        modelId,
        backoffMs: 0,
        reason: '无可用备选模型',
        rateLimitStreak: streak,
      };
    }

    const nextName = next.name || next.id;
    logger.info(`[BackoffCoordinator] 模型 ${modelId} → 跨模型降级到 ${nextName}`);
    return {
      action: 'switch-model',
      layer: 'model',
      modelId,
      nextModelId: next.id,
      nextModelName: nextName,
      backoffMs: MODEL_SWITCH_BACKOFF_MS,
      reason: `跨模型降级（${category}）`,
      rateLimitStreak: streak,
    };
  }
}

// ===================== 单例 =====================

let coordinatorSingleton: BackoffCoordinator | null = null;

/** 获取全局 BackoffCoordinator 单例 */
export function getBackoffCoordinator(): BackoffCoordinator {
  if (!coordinatorSingleton) {
    coordinatorSingleton = new BackoffCoordinator();
  }
  return coordinatorSingleton;
}
