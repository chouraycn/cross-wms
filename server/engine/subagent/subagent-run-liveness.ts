/**
 * Subagent Run Liveness — 运行活性检测
 *
 * 检测和管理子代理的活性状态。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent, updateSubagentStatus, listActiveSubagents } from './subagent-registry.state.js';
import { isActiveStatus, getLastActivityTime } from './subagent-registry.helpers.js';

export interface LivenessCheckOptions {
  timeoutMs?: number;
  idleTimeoutMs?: number;
  checkIntervalMs?: number;
}

export interface LivenessResult {
  instanceId: string;
  alive: boolean;
  status: 'alive' | 'idle' | 'timed_out' | 'dead';
  lastActivityAt: number;
  ageMs: number;
}

export interface LivenessStats {
  total: number;
  alive: number;
  idle: number;
  timedOut: number;
  dead: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

export function checkLiveness(
  instanceId: string,
  options: LivenessCheckOptions = {},
): LivenessResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return {
      instanceId,
      alive: false,
      status: 'dead',
      lastActivityAt: 0,
      ageMs: 0,
    };
  }

  if (!isActiveStatus(instance.status)) {
    return {
      instanceId,
      alive: false,
      status: 'dead',
      lastActivityAt: instance.lastActivityAt ?? instance.completedAt ?? instance.spawnedAt,
      ageMs: Date.now() - instance.spawnedAt,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const lastActivity = instance.lastActivityAt ?? instance.spawnedAt;
  const ageMs = Date.now() - instance.spawnedAt;
  const idleMs = Date.now() - lastActivity;

  if (ageMs >= timeoutMs) {
    return {
      instanceId,
      alive: false,
      status: 'timed_out',
      lastActivityAt: lastActivity,
      ageMs,
    };
  }

  if (idleMs >= idleTimeoutMs) {
    return {
      instanceId,
      alive: true,
      status: 'idle',
      lastActivityAt: lastActivity,
      ageMs,
    };
  }

  return {
    instanceId,
    alive: true,
    status: 'alive',
    lastActivityAt: lastActivity,
    ageMs,
  };
}

export function checkAllLiveness(options: LivenessCheckOptions = {}): LivenessResult[] {
  const instances = listActiveSubagents({
    status: ['spawning', 'running', 'paused'],
  });

  return instances.map((instance) => checkLiveness(instance.id, options));
}

export function getLivenessStats(options: LivenessCheckOptions = {}): LivenessStats {
  const results = checkAllLiveness(options);

  const stats: LivenessStats = {
    total: results.length,
    alive: 0,
    idle: 0,
    timedOut: 0,
    dead: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case 'alive':
        stats.alive++;
        break;
      case 'idle':
        stats.idle++;
        break;
      case 'timed_out':
        stats.timedOut++;
        break;
      case 'dead':
        stats.dead++;
        break;
    }
  }

  return stats;
}

export function markInstanceAlive(instanceId: string): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) return false;

  updateSubagentStatus(instanceId, instance.status, { lastActivityAt: Date.now() });
  return true;
}

export function markInstanceDead(instanceId: string, reason?: string): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) return false;

  updateSubagentStatus(instanceId, 'failed', {
    error: reason ?? 'Instance marked as dead',
    completedAt: Date.now(),
    lastActivityAt: Date.now(),
  });
  logger.debug(`[SubagentLiveness] Marked instance ${instanceId} as dead: ${reason}`);
  return true;
}

let livenessCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startLivenessMonitor(options: LivenessCheckOptions = {}): void {
  if (livenessCheckInterval) {
    stopLivenessMonitor();
  }

  const intervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

  livenessCheckInterval = setInterval(() => {
    const results = checkAllLiveness(options);
    const timedOut = results.filter((r) => r.status === 'timed_out');

    for (const result of timedOut) {
      logger.warn(`[SubagentLiveness] Instance ${result.instanceId} timed out`);
      markInstanceDead(result.instanceId, 'Liveness timeout');
    }
  }, intervalMs);

  logger.debug(`[SubagentLiveness] Monitor started (interval: ${intervalMs}ms)`);
}

export function stopLivenessMonitor(): void {
  if (livenessCheckInterval) {
    clearInterval(livenessCheckInterval);
    livenessCheckInterval = null;
    logger.debug('[SubagentLiveness] Monitor stopped');
  }
}

export function isLivenessMonitorRunning(): boolean {
  return livenessCheckInterval !== null;
}