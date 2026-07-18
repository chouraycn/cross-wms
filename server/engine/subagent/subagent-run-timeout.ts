/**
 * Subagent Run Timeout — 运行超时
 *
 * 管理子代理的超时策略和处理。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent, updateSubagentStatus, listActiveSubagents } from './subagent-registry.state.js';
import { cancelSubagent } from './subagent-control.js';

export interface TimeoutOptions {
  runTimeoutMs?: number;
  spawnTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface TimeoutResult {
  instanceId: string;
  timedOut: boolean;
  timeoutType: 'run' | 'spawn' | 'idle' | 'none';
  remainingMs?: number;
}

export interface TimeoutStats {
  total: number;
  runTimeout: number;
  spawnTimeout: number;
  idleTimeout: number;
  noTimeout: number;
}

const DEFAULT_RUN_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_SPAWN_TIMEOUT_MS = 30 * 1000;
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

const timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function checkTimeout(
  instanceId: string,
  options: TimeoutOptions = {},
): TimeoutResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return {
      instanceId,
      timedOut: false,
      timeoutType: 'none',
    };
  }

  const runTimeoutMs = options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  const spawnTimeoutMs = options.spawnTimeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

  const now = Date.now();

  if (instance.status === 'spawning') {
    const elapsed = now - instance.spawnedAt;
    if (elapsed >= spawnTimeoutMs) {
      return {
        instanceId,
        timedOut: true,
        timeoutType: 'spawn',
      };
    }
    return {
      instanceId,
      timedOut: false,
      timeoutType: 'spawn',
      remainingMs: spawnTimeoutMs - elapsed,
    };
  }

  if (instance.status === 'running' || instance.status === 'paused') {
    const startTime = instance.startedAt ?? instance.spawnedAt;
    const elapsed = now - startTime;

    if (elapsed >= runTimeoutMs) {
      return {
        instanceId,
        timedOut: true,
        timeoutType: 'run',
      };
    }

    const lastActivity = instance.lastActivityAt ?? instance.startedAt ?? instance.spawnedAt;
    const idleElapsed = now - lastActivity;

    if (idleElapsed >= idleTimeoutMs) {
      return {
        instanceId,
        timedOut: true,
        timeoutType: 'idle',
      };
    }

    return {
      instanceId,
      timedOut: false,
      timeoutType: 'run',
      remainingMs: runTimeoutMs - elapsed,
    };
  }

  return {
    instanceId,
    timedOut: false,
    timeoutType: 'none',
  };
}

export function checkAllTimeouts(options: TimeoutOptions = {}): TimeoutResult[] {
  const instances = listActiveSubagents({
    status: ['spawning', 'running', 'paused'],
  });

  return instances.map((instance) => checkTimeout(instance.id, options));
}

export function getTimeoutStats(options: TimeoutOptions = {}): TimeoutStats {
  const results = checkAllTimeouts(options);

  const stats: TimeoutStats = {
    total: results.length,
    runTimeout: 0,
    spawnTimeout: 0,
    idleTimeout: 0,
    noTimeout: 0,
  };

  for (const result of results) {
    if (result.timedOut) {
      switch (result.timeoutType) {
        case 'run':
          stats.runTimeout++;
          break;
        case 'spawn':
          stats.spawnTimeout++;
          break;
        case 'idle':
          stats.idleTimeout++;
          break;
      }
    } else {
      stats.noTimeout++;
    }
  }

  return stats;
}

export function scheduleTimeout(
  instanceId: string,
  timeoutMs: number,
  onTimeout: (instanceId: string) => void,
): void {
  cancelScheduledTimeout(instanceId);

  const timer = setTimeout(() => {
    timeoutTimers.delete(instanceId);
    onTimeout(instanceId);
  }, timeoutMs);

  timeoutTimers.set(instanceId, timer);
}

export function cancelScheduledTimeout(instanceId: string): void {
  const timer = timeoutTimers.get(instanceId);
  if (timer) {
    clearTimeout(timer);
    timeoutTimers.delete(instanceId);
  }
}

export function handleTimeout(instanceId: string, timeoutType: string): void {
  logger.warn(`[SubagentTimeout] Instance ${instanceId} timed out (${timeoutType})`);

  const instance = getActiveSubagent(instanceId);
  if (!instance) return;

  cancelScheduledTimeout(instanceId);

  cancelSubagent(instanceId, `${timeoutType} timeout`);
}

export function scheduleInstanceTimeout(
  instance: SubagentInstance,
  options: TimeoutOptions = {},
): void {
  if (instance.status === 'spawning') {
    const timeoutMs = options.spawnTimeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS;
    scheduleTimeout(instance.id, timeoutMs, (id) => handleTimeout(id, 'spawn'));
  } else if (instance.status === 'running') {
    const timeoutMs = options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
    const startTime = instance.startedAt ?? instance.spawnedAt;
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, timeoutMs - elapsed);
    scheduleTimeout(instance.id, remaining, (id) => handleTimeout(id, 'run'));
  }
}

export function clearAllTimeouts(): void {
  for (const [instanceId, timer] of timeoutTimers) {
    clearTimeout(timer);
  }
  timeoutTimers.clear();
  logger.debug('[SubagentTimeout] Cleared all timeout timers');
}

export function getScheduledTimeoutCount(): number {
  return timeoutTimers.size;
}