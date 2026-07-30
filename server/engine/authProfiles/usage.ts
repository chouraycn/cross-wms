/**
 * Auth Profile 使用统计与 failover。
 *
 * 提供：
 *   - 成功 / 失败标记（更新冷却、错误计数、lastGood）
 *   - 阶梯式冷却计算（30s → 60s → 5min）
 *   - 可用性判定与 provider 级别不可用原因汇总
 *
 * 适配自 openclaw 的 auth-profiles usage 模块，去除了 WHAM 探测、disabled 通道与
 * model-scoped 冷却，保留核心的 load-mutate-save failover 流程。
 */

import { logger } from '../../logger.js';
import { loadAuthProfileStore, saveAuthProfileStore, listProfilesForProvider } from './store.js';
import type {
  AuthProfile,
  AuthProfileFailureReason,
} from './types.js';

/** 失败原因优先级：用于多 profile 不可用时挑选最具信号的原因。 */
const FAILURE_REASON_PRIORITY: AuthProfileFailureReason[] = [
  'auth_permanent',
  'auth',
  'billing',
  'model_not_found',
  'timeout',
  'rate_limit',
  'empty_response',
  'unclassified',
  'unknown',
];

const FAILURE_REASON_ORDER = new Map<AuthProfileFailureReason, number>(
  FAILURE_REASON_PRIORITY.map((reason, index) => [reason, index])
);

/**
 * 计算阶梯式冷却时长（毫秒）。
 * - 第 1 次失败：30 秒
 * - 第 2 次失败：60 秒
 * - 第 3 次及以后：5 分钟（上限）
 */
export function calculateCooldownMs(errorCount: number): number {
  const normalized = Math.max(1, errorCount);
  if (normalized <= 1) return 30_000;
  if (normalized <= 2) return 60_000;
  return 5 * 60_000;
}

/**
 * 标记 profile 成功：清除冷却与错误计数，更新 lastUsed 与 lastGood。
 * 若 profile 不存在则跳过。
 */
export function markProfileSuccess(profileId: string): void {
  const store = loadAuthProfileStore();
  const profile = store.profiles[profileId];
  if (!profile) {
    logger.debug('[AuthProfileUsage] 成功标记跳过：profile 不存在', { id: profileId });
    return;
  }

  const now = Date.now();
  profile.usageStats = {
    ...profile.usageStats,
    errorCount: 0,
    cooldownUntil: undefined,
    cooldownReason: undefined,
    blockedUntil: undefined,
    lastUsed: now,
    lastFailureAt: undefined,
  };
  profile.updatedAt = now;

  // 更新 lastGood：记住该 provider 最近一次成功的 profileId
  store.lastGood[profile.provider] = profileId;

  saveAuthProfileStore(store);
  logger.debug('[AuthProfileUsage] profile 成功标记', { id: profileId, provider: profile.provider });
}

/**
 * 标记 profile 失败：递增 errorCount，计算阶梯冷却并设置 cooldownUntil。
 * 若上一次冷却已过期，先重置计数器以避免陈旧错误数导致冷却阶梯跳变。
 */
export function markProfileFailure(profileId: string, reason: AuthProfileFailureReason): void {
  const store = loadAuthProfileStore();
  const profile = store.profiles[profileId];
  if (!profile) {
    logger.debug('[AuthProfileUsage] 失败标记跳过：profile 不存在', { id: profileId });
    return;
  }

  const now = Date.now();
  const existing = profile.usageStats ?? {};

  // 若上一次冷却已过期，重置错误计数，给 profile 一个新的退避窗口
  const previousCooldownExpired =
    typeof existing.cooldownUntil === 'number' &&
    existing.cooldownUntil > 0 &&
    now >= existing.cooldownUntil;
  const shouldResetCounters = previousCooldownExpired ||
    existing.errorCount === undefined ||
    existing.errorCount === 0;

  const baseErrorCount = shouldResetCounters ? 0 : (existing.errorCount ?? 0);
  const nextErrorCount = baseErrorCount + 1;
  const cooldownMs = calculateCooldownMs(nextErrorCount);

  // 若当前冷却窗口仍有效，保留原到期时间，避免重试把恢复时间推得更远
  const cooldownActive =
    typeof existing.cooldownUntil === 'number' &&
    existing.cooldownUntil > now;
  const cooldownUntil = cooldownActive ? existing.cooldownUntil : now + cooldownMs;

  profile.usageStats = {
    ...existing,
    errorCount: nextErrorCount,
    cooldownUntil,
    cooldownReason: reason,
    lastFailureAt: now,
  };
  profile.updatedAt = now;

  saveAuthProfileStore(store);
  logger.debug('[AuthProfileUsage] profile 失败标记', {
    id: profileId,
    provider: profile.provider,
    reason,
    errorCount: nextErrorCount,
    cooldownUntil,
  });
}

/**
 * 判断 profile 当前是否可用（未被冷却或阻塞）。
 */
export function isProfileAvailable(profile: AuthProfile): boolean {
  return isProfileAvailableAt(profile, Date.now());
}

/** 内部辅助：以指定时间判定可用性，便于测试。 */
function isProfileAvailableAt(profile: AuthProfile, now: number): boolean {
  const stats = profile.usageStats;
  if (!stats) return true;

  if (typeof stats.blockedUntil === 'number' && stats.blockedUntil > now) {
    return false;
  }
  if (typeof stats.cooldownUntil === 'number' && stats.cooldownUntil > now) {
    return false;
  }
  return true;
}

/**
 * 返回指定 provider 下当前可用的 auth profile 列表（按 createdAt 升序）。
 */
export function getAvailableProfilesForProvider(provider: string): AuthProfile[] {
  const profiles = listProfilesForProvider(provider);
  return profiles.filter((p) => isProfileAvailable(p));
}

/**
 * 汇总指定 provider 下所有 profile 不可用的原因。
 *
 * 优先返回显式的 cooldownReason；若无则按失败原因优先级挑选；
 * 当存在可用 profile 或无 profile 时返回 null。
 */
export function resolveProfilesUnavailableReason(provider: string): string | null {
  const profiles = listProfilesForProvider(provider);
  if (profiles.length === 0) return null;

  const now = Date.now();
  const reasonCounts = new Map<AuthProfileFailureReason, number>();

  for (const profile of profiles) {
    if (isProfileAvailableAt(profile, now)) continue;

    const stats = profile.usageStats ?? {};
    if (stats.cooldownReason) {
      reasonCounts.set(
        stats.cooldownReason,
        (reasonCounts.get(stats.cooldownReason) ?? 0) + 1
      );
    } else {
      // 未记录显式原因，记为 unknown
      reasonCounts.set('unknown', (reasonCounts.get('unknown') ?? 0) + 1);
    }
  }

  if (reasonCounts.size === 0) return null;

  // 按出现次数降序，次数相同则按优先级（更严重的原因）升序
  let best: AuthProfileFailureReason | null = null;
  let bestCount = -1;
  let bestPriority = Number.MAX_SAFE_INTEGER;
  for (const reason of FAILURE_REASON_PRIORITY) {
    const count = reasonCounts.get(reason);
    if (typeof count !== 'number' || count <= 0) continue;
    const priority = FAILURE_REASON_ORDER.get(reason) ?? Number.MAX_SAFE_INTEGER;
    if (count > bestCount || (count === bestCount && priority < bestPriority)) {
      best = reason;
      bestCount = count;
      bestPriority = priority;
    }
  }

  return best;
}
