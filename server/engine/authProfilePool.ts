/**
 * Auth Profiles — 认证配置池与故障转移模块
 *
 * 功能特性：
 * - 多 API Key / 多认证配置池管理
 * - 智能轮询：失败自动冷却，成功自动恢复
 * - 错误分类：区分 rate_limit / auth / billing / timeout / model_not_found
 * - 探测恢复：冷却期内允许有限次数的探测请求
 * - 永久错误不消耗探测配额（如 auth_permanent、model_not_found）
 * - 配置持久化支持
 *
 * 使用方式：
 *   const pool = new AuthProfilePool('deepseek');
 *   pool.addProfile({ id: 'key1', apiKey: 'sk-xxx1' });
 *   pool.addProfile({ id: 'key2', apiKey: 'sk-xxx2' });
 *   const profile = pool.getNextAvailable();
 *   pool.recordSuccess(profile.id);
 *   pool.recordFailure(profile.id, 'rate_limit');
 */

import { logger } from '../logger.js';

// ==================== 类型定义 ====================

export type FailoverReason =
  | 'rate_limit'
  | 'overloaded'
  | 'billing'
  | 'timeout'
  | 'auth'
  | 'auth_permanent'
  | 'model_not_found'
  | 'context_overflow'
  | 'empty_response'
  | 'format'
  | 'session_expired'
  | 'unknown'
  | 'no_error_details'
  | 'unclassified';

export interface AuthProfile {
  id: string;
  apiKey: string;
  baseUrl?: string;
  label?: string;
  priority?: number;
  maxFailuresBeforeCooldown?: number;
  cooldownMs?: number;
  probeSlots?: number;
  metadata?: Record<string, unknown>;
}

export interface AuthProfileRuntimeState {
  id: string;
  status: 'available' | 'cooling_down' | 'disabled';
  consecutiveFailures: number;
  lastFailureAt?: number;
  lastFailureReason?: FailoverReason;
  lastSuccessAt?: number;
  totalSuccesses: number;
  totalFailures: number;
  probesUsedInCooldown: number;
  cooldownUntil?: number;
}

export interface AuthProfilePoolConfig {
  maxFailuresBeforeCooldown: number;
  cooldownMs: number;
  probeSlots: number;
  probeCooldownMs: number;
  rotationStrategy: 'round_robin' | 'priority' | 'random';
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: AuthProfilePoolConfig = {
  maxFailuresBeforeCooldown: 3,
  cooldownMs: 5 * 60 * 1000,
  probeSlots: 2,
  probeCooldownMs: 30 * 1000,
  rotationStrategy: 'round_robin',
};

// ==================== 错误分类辅助函数 ====================

export function classifyError(error: unknown): FailoverReason {
  if (!error) return 'unknown';

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (/rate.?limit|too many requests|429/.test(lower)) return 'rate_limit';
  if (/overload|busy|503|502/.test(lower)) return 'overloaded';
  if (/billing|insufficient|quota|credit|payment|402/.test(lower)) return 'billing';
  if (/timeout|timed out|ETIMEDOUT/.test(lower)) return 'timeout';
  if (/unauthorized|invalid.*key|auth.*fail|401|403/.test(lower)) {
    if (/permanent|revoked|deleted/.test(lower)) return 'auth_permanent';
    return 'auth';
  }
  if (/model.*not.*found|model.*invalid|unknown.*model/.test(lower)) return 'model_not_found';
  if (/context.*length|too long|max.*token|context.*overflow/.test(lower)) return 'context_overflow';
  if (/empty.*response|no content|finish_reason.*empty/.test(lower)) return 'empty_response';
  if (/format|parse.*error|invalid.*response/.test(lower)) return 'format';
  if (/session.*expir|token.*expir/.test(lower)) return 'session_expired';
  if (/no.*error|unknown.*error/.test(lower)) return 'no_error_details';

  return 'unclassified';
}

/** 判断是否为瞬时错误，应该重试 */
export function isTransientError(reason: FailoverReason): boolean {
  return (
    reason === 'rate_limit' ||
    reason === 'overloaded' ||
    reason === 'timeout' ||
    reason === 'unknown' ||
    reason === 'empty_response' ||
    reason === 'no_error_details' ||
    reason === 'unclassified'
  );
}

/** 判断冷却期内是否允许探测 */
export function shouldAllowCooldownProbe(reason: FailoverReason | null): boolean {
  if (!reason) return true;
  return isTransientError(reason) || reason === 'billing';
}

/** 判断失败是否消耗探测配额 */
export function shouldUseProbeSlot(reason: FailoverReason): boolean {
  return isTransientError(reason);
}

/** 判断失败是否应保留探测配额（永久错误不消耗） */
export function shouldPreserveProbeSlot(reason: FailoverReason): boolean {
  return (
    reason === 'model_not_found' ||
    reason === 'format' ||
    reason === 'auth_permanent' ||
    reason === 'session_expired' ||
    reason === 'context_overflow'
  );
}

// ==================== AuthProfilePool ====================

export class AuthProfilePool {
  private poolName: string;
  private config: AuthProfilePoolConfig;
  private profiles: Map<string, AuthProfile> = new Map();
  private states: Map<string, AuthProfileRuntimeState> = new Map();
  private roundRobinIndex = 0;

  constructor(poolName: string, config?: Partial<AuthProfilePoolConfig>) {
    this.poolName = poolName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfig(config: Partial<AuthProfilePoolConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug(`[AuthPool:${this.poolName}] 配置已更新`);
  }

  addProfile(profile: AuthProfile): void {
    if (this.profiles.has(profile.id)) {
      logger.warn(`[AuthPool:${this.poolName}] 配置已存在，覆盖: ${profile.id}`);
    }

    this.profiles.set(profile.id, profile);
    this.states.set(profile.id, {
      id: profile.id,
      status: 'available',
      consecutiveFailures: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      probesUsedInCooldown: 0,
    });

    logger.debug(`[AuthPool:${this.poolName}] 添加配置: ${profile.label || profile.id}`);
  }

  removeProfile(id: string): boolean {
    const existed = this.profiles.delete(id);
    this.states.delete(id);
    if (existed) {
      logger.debug(`[AuthPool:${this.poolName}] 移除配置: ${id}`);
    }
    return existed;
  }

  getProfile(id: string): AuthProfile | null {
    return this.profiles.get(id) || null;
  }

  getState(id: string): AuthProfileRuntimeState | null {
    return this.states.get(id) || null;
  }

  getAllProfiles(): AuthProfile[] {
    return Array.from(this.profiles.values());
  }

  getAllStates(): AuthProfileRuntimeState[] {
    return Array.from(this.states.values());
  }

  getAvailableCount(): number {
    let count = 0;
    for (const state of this.states.values()) {
      if (this.isProfileAvailable(state)) count++;
    }
    return count;
  }

  private isProfileAvailable(state: AuthProfileRuntimeState): boolean {
    if (state.status === 'disabled') return false;
    if (state.status === 'available') return true;

    if (state.status === 'cooling_down') {
      const now = Date.now();
      if (state.cooldownUntil && now >= state.cooldownUntil) {
        this.recoverProfile(state.id);
        return true;
      }
      if (state.probesUsedInCooldown < this.config.probeSlots) {
        return true;
      }
    }

    return false;
  }

  getNextAvailable(): AuthProfile | null {
    const profiles = this.getAvailableProfilesOrdered();
    if (profiles.length === 0) {
      logger.warn(`[AuthPool:${this.poolName}] 无可用配置！`);
      return null;
    }

    let selected: AuthProfile | null = null;

    switch (this.config.rotationStrategy) {
      case 'priority':
        selected = profiles.sort(
          (a, b) => (a.priority ?? 0) - (b.priority ?? 0)
        )[0];
        break;
      case 'random':
        selected = profiles[Math.floor(Math.random() * profiles.length)];
        break;
      case 'round_robin':
      default:
        selected = profiles[this.roundRobinIndex % profiles.length];
        this.roundRobinIndex++;
        break;
    }

    if (selected) {
      const state = this.states.get(selected.id);
      if (state?.status === 'cooling_down') {
        state.probesUsedInCooldown++;
        logger.debug(
          `[AuthPool:${this.poolName}] 使用探测配额: ${selected.id} (${state.probesUsedInCooldown}/${this.config.probeSlots})`
        );
      }
    }

    return selected;
  }

  private getAvailableProfilesOrdered(): AuthProfile[] {
    const result: AuthProfile[] = [];
    for (const [id, state] of this.states.entries()) {
      if (this.isProfileAvailable(state)) {
        const profile = this.profiles.get(id);
        if (profile) result.push(profile);
      }
    }
    return result;
  }

  recordSuccess(id: string): void {
    const state = this.states.get(id);
    if (!state) return;

    const wasCoolingDown = state.status === 'cooling_down';

    state.status = 'available';
    state.consecutiveFailures = 0;
    state.lastSuccessAt = Date.now();
    state.totalSuccesses++;
    state.probesUsedInCooldown = 0;
    state.cooldownUntil = undefined;

    if (wasCoolingDown) {
      logger.info(`[AuthPool:${this.poolName}] 配置恢复: ${id}`);
    }
  }

  recordFailure(id: string, reason: FailoverReason | Error | unknown): void {
    const state = this.states.get(id);
    if (!state) return;

    const classifiedReason =
      typeof reason === 'string' ? (reason as FailoverReason) : classifyError(reason);

    state.lastFailureAt = Date.now();
    state.lastFailureReason = classifiedReason;
    state.totalFailures++;
    state.consecutiveFailures++;

    if (shouldPreserveProbeSlot(classifiedReason)) {
      state.probesUsedInCooldown = Math.max(0, state.probesUsedInCooldown - 1);
    }

    const profile = this.profiles.get(id);
    const maxFailures = profile?.maxFailuresBeforeCooldown ?? this.config.maxFailuresBeforeCooldown;
    const cooldownMs = profile?.cooldownMs ?? this.config.cooldownMs;

    if (classifiedReason === 'auth_permanent') {
      state.status = 'disabled';
      logger.warn(
        `[AuthPool:${this.poolName}] 配置永久禁用: ${id} (原因: ${classifiedReason})`
      );
      return;
    }

    if (state.consecutiveFailures >= maxFailures) {
      state.status = 'cooling_down';
      state.cooldownUntil = Date.now() + cooldownMs;
      state.probesUsedInCooldown = 0;

      logger.warn(
        `[AuthPool:${this.poolName}] 配置进入冷却: ${id} ` +
        `(连续失败 ${state.consecutiveFailures} 次, 原因: ${classifiedReason}, ` +
        `冷却 ${(cooldownMs / 1000).toFixed(0)}s)`
      );
    } else {
      logger.debug(
        `[AuthPool:${this.poolName}] 配置失败: ${id} ` +
        `(连续失败 ${state.consecutiveFailures}/${maxFailures}, 原因: ${classifiedReason})`
      );
    }
  }

  private recoverProfile(id: string): void {
    const state = this.states.get(id);
    if (!state) return;

    state.status = 'available';
    state.consecutiveFailures = 0;
    state.probesUsedInCooldown = 0;
    state.cooldownUntil = undefined;

    logger.info(`[AuthPool:${this.poolName}] 配置自动恢复: ${id}`);
  }

  resetCooldown(id: string): boolean {
    const state = this.states.get(id);
    if (!state) return false;

    state.status = 'available';
    state.consecutiveFailures = 0;
    state.probesUsedInCooldown = 0;
    state.cooldownUntil = undefined;

    logger.info(`[AuthPool:${this.poolName}] 手动重置配置: ${id}`);
    return true;
  }

  resetAll(): void {
    for (const state of this.states.values()) {
      state.status = 'available';
      state.consecutiveFailures = 0;
      state.probesUsedInCooldown = 0;
      state.cooldownUntil = undefined;
    }
    this.roundRobinIndex = 0;
    logger.info(`[AuthPool:${this.poolName}] 全部重置`);
  }

  getStats(): {
    total: number;
    available: number;
    coolingDown: number;
    disabled: number;
    totalSuccesses: number;
    totalFailures: number;
  } {
    let available = 0;
    let coolingDown = 0;
    let disabled = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;

    for (const state of this.states.values()) {
      if (state.status === 'available') available++;
      else if (state.status === 'cooling_down') coolingDown++;
      else if (state.status === 'disabled') disabled++;
      totalSuccesses += state.totalSuccesses;
      totalFailures += state.totalFailures;
    }

    return {
      total: this.profiles.size,
      available,
      coolingDown,
      disabled,
      totalSuccesses,
      totalFailures,
    };
  }
}

// ==================== 全局池管理 ====================

const pools = new Map<string, AuthProfilePool>();

export function getAuthProfilePool(poolName: string): AuthProfilePool {
  let pool = pools.get(poolName);
  if (!pool) {
    pool = new AuthProfilePool(poolName);
    pools.set(poolName, pool);
  }
  return pool;
}

export function hasAuthProfilePool(poolName: string): boolean {
  return pools.has(poolName);
}

export function getAllAuthPools(): Map<string, AuthProfilePool> {
  return pools;
}
