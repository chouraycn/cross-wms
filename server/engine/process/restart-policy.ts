/**
 * 重启策略
 *
 * 支持立即/延迟/指数退避三种模式，并限制最大重启次数。
 */

import { logger } from '../../logger.js';
import type { TerminationReason } from './types.js';

/** 重启模式 */
export type RestartMode = 'never' | 'immediate' | 'fixed-delay' | 'exponential-backoff';

/** 重启策略配置 */
export interface RestartPolicyConfig {
  /** 唯一 id（用于注册表查询） */
  id: string;
  /** 重启模式 */
  mode: RestartMode;
  /** 最大重启次数（>=0；0 表示永不重启） */
  maxAttempts: number;
  /** 固定延迟（毫秒），用于 fixed-delay */
  delayMs?: number;
  /** 指数退避基准延迟（毫秒） */
  baseDelayMs?: number;
  /** 指数退避最大延迟（毫秒） */
  maxDelayMs?: number;
  /** 抖动因子 0..1（加入随机抖动，避免惊群） */
  jitter?: number;
  /** 不应触发重启的退出原因集合 */
  noRestartReasons?: TerminationReason[];
  /** 重启窗口（毫秒）：超过窗口后重置计数 */
  windowMs?: number;
}

/** 默认配置 */
export const DEFAULT_RESTART_POLICY: RestartPolicyConfig = {
  id: 'default',
  mode: 'exponential-backoff',
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5_000,
  jitter: 0.2,
  noRestartReasons: ['manual-stop', 'restart-policy-stop', 'resource-limit'],
};

/** 重启策略状态 */
export interface RestartPolicyState {
  attempts: number;
  lastRestartAtMs: number | null;
  lastReason?: TerminationReason;
  windowStartAtMs: number | null;
}

const DEFAULT_NOW = () => Date.now();
const DEFAULT_RANDOM = () => Math.random();

/**
 * 计算给定策略 + 尝试次数下的下次重启延迟（毫秒）
 */
export function computeRestartDelay(
  policy: RestartPolicyConfig,
  attempt: number,
  random: () => number = DEFAULT_RANDOM,
): number {
  switch (policy.mode) {
    case 'never':
      return 0;
    case 'immediate':
      return 0;
    case 'fixed-delay':
      return Math.max(0, Math.floor(policy.delayMs ?? 0));
    case 'exponential-backoff': {
      const base = Math.max(0, policy.baseDelayMs ?? 0);
      const max = Math.max(base, policy.maxDelayMs ?? base);
      const exp = base * Math.pow(2, Math.max(0, attempt));
      const capped = Math.min(exp, max);
      const jitter = policy.jitter ?? 0;
      if (jitter <= 0) {
        return Math.max(0, Math.floor(capped));
      }
      const offset = (random() * 2 - 1) * jitter * capped;
      return Math.max(0, Math.floor(capped + offset));
    }
    default:
      return 0;
  }
}

/**
 * 重启策略实例
 *
 * 跟踪一个进程的重启次数与窗口状态，决定是否应继续重启。
 */
export class RestartPolicy {
  readonly config: RestartPolicyConfig;
  private state: RestartPolicyState = {
    attempts: 0,
    lastRestartAtMs: null,
    windowStartAtMs: null,
  };
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    config: RestartPolicyConfig,
    deps?: { now?: () => number; random?: () => number },
  ) {
    this.config = { ...DEFAULT_RESTART_POLICY, ...config };
    this.now = deps?.now ?? DEFAULT_NOW;
    this.random = deps?.random ?? DEFAULT_RANDOM;
  }

  /** 当前状态快照（不可变） */
  getState(): Readonly<RestartPolicyState> {
    return { ...this.state };
  }

  /**
   * 决定是否应该重启
   *
   * 若 mode === 'never' 或 attempts >= maxAttempts，返回 false。
   * 若 reason 在 noRestartReasons 中，返回 false。
   */
  shouldRestart(reason: TerminationReason): boolean {
    if (this.config.mode === 'never') {
      return false;
    }
    if (this.config.maxAttempts <= 0) {
      return false;
    }
    if (this.config.noRestartReasons?.includes(reason)) {
      return false;
    }
    const t = this.now();
    if (this.state.windowStartAtMs === null) {
      this.state.windowStartAtMs = t;
    } else if (this.config.windowMs && t - this.state.windowStartAtMs > this.config.windowMs) {
      // 超过窗口重置计数
      this.state = { attempts: 0, lastRestartAtMs: null, windowStartAtMs: t };
    }
    return this.state.attempts < this.config.maxAttempts;
  }

  /** 计算下次重启延迟（毫秒） */
  nextDelayMs(): number {
    return computeRestartDelay(this.config, this.state.attempts, this.random);
  }

  /** 记录一次重启 */
  recordRestart(reason: TerminationReason): void {
    this.state = {
      attempts: this.state.attempts + 1,
      lastRestartAtMs: this.now(),
      lastReason: reason,
      windowStartAtMs: this.state.windowStartAtMs ?? this.now(),
    };
    logger.debug(
      `[Process:RestartPolicy] ${this.config.id} attempt=${this.state.attempts}/${this.config.maxAttempts} reason=${reason}`,
    );
  }

  /** 重置计数（成功运行稳定后调用） */
  reset(): void {
    this.state = { attempts: 0, lastRestartAtMs: null, windowStartAtMs: null };
  }
}

/** 全局策略注册表（按 id 索引） */
export class RestartPolicyRegistry {
  private readonly policies = new Map<string, RestartPolicyConfig>();

  register(config: RestartPolicyConfig): void {
    this.policies.set(config.id, { ...config });
  }

  get(id: string): RestartPolicyConfig | undefined {
    return this.policies.get(id);
  }

  resolve(id?: string): RestartPolicyConfig {
    if (!id) {
      return DEFAULT_RESTART_POLICY;
    }
    return this.policies.get(id) ?? DEFAULT_RESTART_POLICY;
  }

  clear(): void {
    this.policies.clear();
  }
}
