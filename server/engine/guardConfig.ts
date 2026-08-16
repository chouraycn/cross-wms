/**
 * guardConfig — 循环护栏参数配置（对标 DeepSeek Harness guard 包 "no hardcoded tunables"）
 *
 * 原则：部署可变的阈值一律来自配置，代码里不出现裸的魔数常量。
 * 配置源：DB app_settings('default') JSON 的 aiEngine.guard 段
 * （与 aiEngine.defaultExecutionMode 同源，见 chatService 读取处）。
 *
 * 默认值 = 历史硬编码值（行为不变）。settings 更新时调用 applyGuardConfigToRuntime() 热生效。
 *
 * 使用方式：
 *   const guard = getGuardConfig();
 *   new LoopDetector(guard.loopDetector.similarityThreshold, ...)   // 或依赖构造器默认回退
 *   maxToolTurns: getGuardConfig().maxToolTurns
 *
 * 租户级覆盖（StaffDeck 多租户）是后续扩展点：getGuardConfig 未来可接受
 * { tenantId } 作用域，先按全局实现。
 */

import { getAppSettings } from '../dao/settings.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export interface LoopDetectorGuardConfig {
  /** Jaccard 相似度阈值（默认 0.8） */
  similarityThreshold: number;
  /** 连续相似轮数触发阈值（默认 3） */
  consecutiveThreshold: number;
  /** 最大历史记录条数（默认 20） */
  maxHistorySize: number;
}

export interface CircuitBreakerGuardConfig {
  /** 降级阈值：连续失败达到此值 → half_open（默认 2） */
  halfOpenThreshold: number;
  /** 熔断阈值：连续失败达到此值 → open（默认 3） */
  openThreshold: number;
  /** open 状态冷却恢复时间 ms（默认 60_000） */
  openCooldownMs: number;
  /** half_open 最大并发探测数（默认 1） */
  maxHalfOpenConcurrent: number;
}

export interface BudgetGuardConfig {
  /** 最大循环轮数（默认 25） */
  maxTurns: number;
  /** 最大 Token 预算（默认 100000） */
  maxTokens: number;
  /** Working Memory 滑窗大小（默认 5） */
  windowSize: number;
  /** v6.0 自适应预算：复杂度 → maxTurns 映射（默认 simple 8 / moderate 20 / complex 40） */
  adaptiveMaxTurns: { simple: number; moderate: number; complex: number };
}

export interface GuardConfig {
  loopDetector: LoopDetectorGuardConfig;
  circuitBreaker: CircuitBreakerGuardConfig;
  budget: BudgetGuardConfig;
  /** executeChat 策略循环最大工具轮数（默认 25，原 streamExecutor 硬编码） */
  maxToolTurns: number;
  /** ReAct 每 N 轮上下文压缩（默认 5，原 reactExecutor 硬编码） */
  contextCompressIntervalTurns: number;
  /** 员工互相派活最大委托深度（默认 3，P2b staffDelegation 用） */
  maxDelegationDepth: number;
}

/** 默认值 = 历史硬编码值（行为不变）。 */
export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  loopDetector: {
    similarityThreshold: 0.8,
    consecutiveThreshold: 3,
    maxHistorySize: 20,
  },
  circuitBreaker: {
    halfOpenThreshold: 2,
    openThreshold: 3,
    openCooldownMs: 60_000,
    maxHalfOpenConcurrent: 1,
  },
  budget: {
    maxTurns: 25,
    maxTokens: 100000,
    windowSize: 5,
    adaptiveMaxTurns: { simple: 8, moderate: 20, complex: 40 },
  },
  maxToolTurns: 25,
  contextCompressIntervalTurns: 5,
  maxDelegationDepth: 3,
};

// ===================== 运行时注册表 =====================

let currentConfig: GuardConfig = structuredClone(DEFAULT_GUARD_CONFIG);

/** 读取当前生效的护栏配置（只读） */
export function getGuardConfig(): Readonly<GuardConfig> {
  return currentConfig;
}

/** 恢复默认配置（测试用） */
export function resetGuardConfig(): void {
  currentConfig = structuredClone(DEFAULT_GUARD_CONFIG);
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    const baseValue = (base as Record<string, unknown>)[key];
    if (
      value !== undefined &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue !== undefined &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      out[key] = mergeDeep(baseValue as Record<string, unknown>, value as DeepPartial<Record<string, unknown>>);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

/** 部分更新（深合并）。返回更新后的配置。 */
export function updateGuardConfig(partial: DeepPartial<GuardConfig>): Readonly<GuardConfig> {
  currentConfig = mergeDeep(currentConfig, partial ?? {});
  return currentConfig;
}

/** 从 DB settings('default').aiEngine.guard 加载（不存在则保持现状）。 */
export function loadGuardConfigFromSettings(): void {
  try {
    const raw = getAppSettings('default');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { aiEngine?: { guard?: DeepPartial<GuardConfig> } };
    const guard = parsed?.aiEngine?.guard;
    if (guard && typeof guard === 'object' && Object.keys(guard).length > 0) {
      updateGuardConfig(guard);
      logger.info('[GuardConfig] 已从 settings 加载护栏配置:', JSON.stringify(guard).slice(0, 500));
    }
  } catch (err) {
    logger.warn('[GuardConfig] 加载护栏配置失败（忽略）:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * 热应用护栏配置：加载 settings → 推送到已存在的运行时实例
 * （当前为 toolExecutor.defaultCircuitBreaker，动态 import 避免静态循环依赖）。
 * 供 server 启动与 settings 保存路由调用（fire-and-forget）。
 */
export async function applyGuardConfigToRuntime(): Promise<void> {
  loadGuardConfigFromSettings();
  try {
    const { defaultCircuitBreaker } = await import('./toolExecutor.js');
    const cb = getGuardConfig().circuitBreaker;
    defaultCircuitBreaker.setThresholds({
      halfOpenThreshold: cb.halfOpenThreshold,
      openThreshold: cb.openThreshold,
      openCooldownMs: cb.openCooldownMs,
      maxHalfOpenConcurrent: cb.maxHalfOpenConcurrent,
    });
  } catch (err) {
    logger.warn('[GuardConfig] 应用护栏配置到运行时失败（忽略）:', err instanceof Error ? err.message : String(err));
  }
}
