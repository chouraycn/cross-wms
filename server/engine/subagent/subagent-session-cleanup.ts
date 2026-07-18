/**
 * Subagent Session Cleanup — 会话清理逻辑
 *
 * 超时子代理回收和资源释放。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import {
  listActiveSubagents,
  removeActiveSubagent,
  updateSubagentStatus,
  getActiveSubagent,
} from './subagent-registry.state.js';
import {
  cleanupOldSubagentInstances,
  isSubagentStoreInitialized,
} from './subagent-registry.store.js';
import { clearSubagentContext, cleanupExpiredContexts } from './subagent-active-context.js';
import { cancelSubagent } from './subagent-control.js';

export interface CleanupPolicy {
  idleTimeoutMs: number;
  runTimeoutMs: number;
  completedRetentionMs: number;
  failedRetentionMs: number;
  cancelledRetentionMs: number;
  maxActiveSubagents: number;
  maxPerParent: number;
}

export interface CleanupStats {
  cleanedIdle: number;
  cleanedTimeout: number;
  cleanedCompleted: number;
  cleanedFailed: number;
  cleanedCancelled: number;
  cleanedOrphaned: number;
  totalCleaned: number;
}

const DEFAULT_POLICY: CleanupPolicy = {
  idleTimeoutMs: 30 * 60 * 1000,
  runTimeoutMs: 60 * 60 * 1000,
  completedRetentionMs: 24 * 60 * 60 * 1000,
  failedRetentionMs: 48 * 60 * 60 * 1000,
  cancelledRetentionMs: 12 * 60 * 60 * 1000,
  maxActiveSubagents: 50,
  maxPerParent: 10,
};

let cleanupPolicy: CleanupPolicy = { ...DEFAULT_POLICY };
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let isCleaningUp = false;

export function setCleanupPolicy(policy: Partial<CleanupPolicy>): void {
  cleanupPolicy = { ...cleanupPolicy, ...policy };
  logger.debug('[SubagentCleanup] Updated cleanup policy:', cleanupPolicy);
}

export function getCleanupPolicy(): Readonly<CleanupPolicy> {
  return { ...cleanupPolicy };
}

export function startCleanupScheduler(intervalMs: number = 60000): void {
  if (cleanupInterval) {
    stopCleanupScheduler();
  }

  cleanupInterval = setInterval(() => {
    void runCleanup();
  }, intervalMs);

  logger.debug(`[SubagentCleanup] Scheduler started (interval: ${intervalMs}ms)`);
}

export function stopCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.debug('[SubagentCleanup] Scheduler stopped');
  }
}

export async function runCleanup(): Promise<CleanupStats> {
  if (isCleaningUp) {
    logger.debug('[SubagentCleanup] Cleanup already in progress, skipping');
    return getZeroStats();
  }

  isCleaningUp = true;

  try {
    const stats: CleanupStats = {
      cleanedIdle: 0,
      cleanedTimeout: 0,
      cleanedCompleted: 0,
      cleanedFailed: 0,
      cleanedCancelled: 0,
      cleanedOrphaned: 0,
      totalCleaned: 0,
    };

    stats.cleanedIdle = await cleanupIdleSubagents();
    stats.cleanedTimeout = await cleanupTimedOutSubagents();
    stats.cleanedOrphaned = cleanupOrphanedContexts();

    if (isSubagentStoreInitialized()) {
      stats.cleanedCompleted = cleanupOldSubagentInstances(cleanupPolicy.completedRetentionMs);
      stats.cleanedFailed = cleanupOldSubagentInstances(cleanupPolicy.failedRetentionMs);
      stats.cleanedCancelled = cleanupOldSubagentInstances(cleanupPolicy.cancelledRetentionMs);
    }

    cleanupExpiredContexts();

    stats.totalCleaned =
      stats.cleanedIdle +
      stats.cleanedTimeout +
      stats.cleanedCompleted +
      stats.cleanedFailed +
      stats.cleanedCancelled +
      stats.cleanedOrphaned;

    if (stats.totalCleaned > 0) {
      logger.debug(`[SubagentCleanup] Cleaned up ${stats.totalCleaned} subagents`, stats);
    }

    return stats;
  } finally {
    isCleaningUp = false;
  }
}

async function cleanupIdleSubagents(): Promise<number> {
  const now = Date.now();
  const activeInstances = listActiveSubagents({
    status: ['running', 'spawning', 'paused'],
  });

  const idleInstances = activeInstances.filter((instance) => {
    const lastActivity = instance.lastActivityAt ?? instance.startedAt ?? instance.spawnedAt;
    return now - lastActivity > cleanupPolicy.idleTimeoutMs;
  });

  let cleaned = 0;
  for (const instance of idleInstances) {
    try {
      const result = await cancelSubagent(instance.id, 'Idle timeout');
      if (result.success) {
        cleaned++;
      }
    } catch (error) {
      logger.error(
        `[SubagentCleanup] Failed to cancel idle subagent ${instance.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return cleaned;
}

async function cleanupTimedOutSubagents(): Promise<number> {
  const now = Date.now();
  const runningInstances = listActiveSubagents({
    status: ['running', 'spawning'],
  });

  const timedOutInstances = runningInstances.filter((instance) => {
    const startTime = instance.startedAt ?? instance.spawnedAt;
    return now - startTime > cleanupPolicy.runTimeoutMs;
  });

  let cleaned = 0;
  for (const instance of timedOutInstances) {
    try {
      const result = await cancelSubagent(instance.id, 'Run timeout');
      if (result.success) {
        cleaned++;
      }
    } catch (error) {
      logger.error(
        `[SubagentCleanup] Failed to cancel timed out subagent ${instance.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return cleaned;
}

function cleanupOrphanedContexts(): number {
  return cleanupExpiredContexts();
}

export function cleanupCompletedSubagents(olderThanMs?: number): number {
  const retentionMs = olderThanMs ?? cleanupPolicy.completedRetentionMs;
  return cleanupOldSubagentInstances(retentionMs);
}

export function cleanupFailedSubagents(olderThanMs?: number): number {
  const retentionMs = olderThanMs ?? cleanupPolicy.failedRetentionMs;
  return cleanupOldSubagentInstances(retentionMs);
}

export function cleanupCancelledSubagents(olderThanMs?: number): number {
  const retentionMs = olderThanMs ?? cleanupPolicy.cancelledRetentionMs;
  return cleanupOldSubagentInstances(retentionMs);
}

export async function cleanupSubagent(instanceId: string): Promise<boolean> {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    clearSubagentContext(instanceId);
    return false;
  }

  if (instance.status === 'running' || instance.status === 'spawning') {
    await cancelSubagent(instanceId, 'Cleanup');
  }

  clearSubagentContext(instanceId);
  const removed = removeActiveSubagent(instanceId);

  logger.debug(`[SubagentCleanup] Cleaned up subagent: ${instanceId}`);
  return removed;
}

export async function cleanupAllSubagents(parentSessionKey?: string): Promise<number> {
  const instances = listActiveSubagents({ parentSessionKey });
  let cleaned = 0;

  for (const instance of instances) {
    const success = await cleanupSubagent(instance.id);
    if (success) {
      cleaned++;
    }
  }

  return cleaned;
}

export function enforceMaxActiveLimit(): number {
  const activeInstances = listActiveSubagents({
    status: ['running', 'spawning', 'paused'],
  });

  if (activeInstances.length <= cleanupPolicy.maxActiveSubagents) {
    return 0;
  }

  const sortedByAge = activeInstances.sort(
    (a, b) => (a.lastActivityAt ?? a.spawnedAt) - (b.lastActivityAt ?? b.spawnedAt),
  );

  const toRemove = sortedByAge.slice(0, activeInstances.length - cleanupPolicy.maxActiveSubagents);
  let removed = 0;

  for (const instance of toRemove) {
    try {
      updateSubagentStatus(instance.id, 'cancelled', {
        error: 'Max active subagents limit exceeded',
        completedAt: Date.now(),
      });
      clearSubagentContext(instance.id);
      removeActiveSubagent(instance.id);
      removed++;
    } catch (error) {
      logger.error(
        `[SubagentCleanup] Failed to enforce limit for subagent ${instance.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (removed > 0) {
    logger.warn(`[SubagentCleanup] Enforced max active limit, removed ${removed} subagents`);
  }

  return removed;
}

export function enforcePerParentLimit(parentSessionKey: string): number {
  const instances = listActiveSubagents({
    parentSessionKey,
    status: ['running', 'spawning', 'paused'],
  });

  if (instances.length <= cleanupPolicy.maxPerParent) {
    return 0;
  }

  const sortedByAge = instances.sort(
    (a, b) => (a.lastActivityAt ?? a.spawnedAt) - (b.lastActivityAt ?? b.spawnedAt),
  );

  const toRemove = sortedByAge.slice(0, instances.length - cleanupPolicy.maxPerParent);
  let removed = 0;

  for (const instance of toRemove) {
    try {
      updateSubagentStatus(instance.id, 'cancelled', {
        error: 'Max subagents per parent limit exceeded',
        completedAt: Date.now(),
      });
      clearSubagentContext(instance.id);
      removeActiveSubagent(instance.id);
      removed++;
    } catch (error) {
      logger.error(
        `[SubagentCleanup] Failed to enforce per-parent limit for subagent ${instance.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (removed > 0) {
    logger.warn(
      `[SubagentCleanup] Enforced per-parent limit for ${parentSessionKey}, removed ${removed} subagents`,
    );
  }

  return removed;
}

function getZeroStats(): CleanupStats {
  return {
    cleanedIdle: 0,
    cleanedTimeout: 0,
    cleanedCompleted: 0,
    cleanedFailed: 0,
    cleanedCancelled: 0,
    cleanedOrphaned: 0,
    totalCleaned: 0,
  };
}

export function getCleanupStats(): {
  active: number;
  running: number;
  policy: Readonly<CleanupPolicy>;
  schedulerRunning: boolean;
} {
  const active = listActiveSubagents();
  const running = active.filter(
    (i) => i.status === 'running' || i.status === 'spawning',
  );

  return {
    active: active.length,
    running: running.length,
    policy: cleanupPolicy,
    schedulerRunning: cleanupInterval !== null,
  };
}

export function resetCleanupPolicy(): void {
  cleanupPolicy = { ...DEFAULT_POLICY };
  logger.debug('[SubagentCleanup] Reset cleanup policy to defaults');
}
