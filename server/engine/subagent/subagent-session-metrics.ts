/**
 * Subagent Session Metrics — 会话指标
 *
 * 收集和报告子代理会话的运行指标。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { listActiveSubagents, listAllSubagentStates } from './subagent-registry.state.js';
import { calculateDuration, getInstanceAge, getLastActivityTime } from './subagent-registry.helpers.js';

export interface SessionMetrics {
  instanceId: string;
  definitionId: string;
  status: string;
  spawnedAt: number;
  startedAt?: number;
  completedAt?: number;
  lastActivityAt?: number;
  durationMs?: number;
  ageMs: number;
  idleMs?: number;
  taskDescription?: string;
  hasResult: boolean;
  hasError: boolean;
}

export interface AggregatedMetrics {
  totalInstances: number;
  activeInstances: number;
  runningInstances: number;
  completedInstances: number;
  failedInstances: number;
  cancelledInstances: number;
  avgDurationMs?: number;
  maxDurationMs?: number;
  minDurationMs?: number;
  avgAgeMs?: number;
  byDefinition: Record<string, {
    total: number;
    active: number;
    completed: number;
    failed: number;
  }>;
}

export function collectSessionMetrics(instanceId: string): SessionMetrics | null {
  const instance = listAllSubagentStates({ includePersisted: true }).find(
    (i) => i.id === instanceId,
  );

  if (!instance) {
    return null;
  }

  const duration = calculateDuration(instance);
  const ageMs = getInstanceAge(instance);
  const lastActivity = getLastActivityTime(instance);
  const idleMs = instance.status === 'running' || instance.status === 'paused'
    ? Date.now() - lastActivity
    : undefined;

  return {
    instanceId: instance.id,
    definitionId: instance.definitionId,
    status: instance.status,
    spawnedAt: instance.spawnedAt,
    startedAt: instance.startedAt,
    completedAt: instance.completedAt,
    lastActivityAt: instance.lastActivityAt,
    durationMs: duration,
    ageMs,
    idleMs,
    taskDescription: instance.taskDescription,
    hasResult: instance.result !== undefined && instance.result !== null,
    hasError: instance.error !== undefined && instance.error !== null,
  };
}

export function collectAllSessionMetrics(): SessionMetrics[] {
  const instances = listAllSubagentStates({ includePersisted: true });
  return instances.map((instance) => collectSessionMetrics(instance.id)).filter(Boolean) as SessionMetrics[];
}

export function aggregateSessionMetrics(): AggregatedMetrics {
  const instances = listAllSubagentStates({ includePersisted: true });
  const active = listActiveSubagents();

  const metrics: AggregatedMetrics = {
    totalInstances: instances.length,
    activeInstances: active.length,
    runningInstances: active.filter((i) => i.status === 'running').length,
    completedInstances: instances.filter((i) => i.status === 'completed').length,
    failedInstances: instances.filter((i) => i.status === 'failed').length,
    cancelledInstances: instances.filter((i) => i.status === 'cancelled').length,
    byDefinition: {},
  };

  const completedDurations: number[] = [];

  for (const instance of instances) {
    if (!metrics.byDefinition[instance.definitionId]) {
      metrics.byDefinition[instance.definitionId] = {
        total: 0,
        active: 0,
        completed: 0,
        failed: 0,
      };
    }

    metrics.byDefinition[instance.definitionId].total++;

    if (active.some((a) => a.id === instance.id)) {
      metrics.byDefinition[instance.definitionId].active++;
    }

    if (instance.status === 'completed') {
      metrics.byDefinition[instance.definitionId].completed++;
      const duration = calculateDuration(instance);
      if (duration) {
        completedDurations.push(duration);
      }
    } else if (instance.status === 'failed') {
      metrics.byDefinition[instance.definitionId].failed++;
    }
  }

  if (completedDurations.length > 0) {
    metrics.avgDurationMs = Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length);
    metrics.maxDurationMs = Math.max(...completedDurations);
    metrics.minDurationMs = Math.min(...completedDurations);
  }

  const ages = instances.map((i) => getInstanceAge(i));
  if (ages.length > 0) {
    metrics.avgAgeMs = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
  }

  return metrics;
}

export function getPerformanceMetrics(): {
  successRate: number;
  failureRate: number;
  avgCompletionTimeMs?: number;
  activeTaskCount: number;
  pendingTaskCount: number;
} {
  const instances = listAllSubagentStates({ includePersisted: true });
  const completed = instances.filter((i) => i.status === 'completed').length;
  const failed = instances.filter((i) => i.status === 'failed').length;
  const cancelled = instances.filter((i) => i.status === 'cancelled').length;
  const totalTerminal = completed + failed + cancelled;

  const active = listActiveSubagents({ status: ['running', 'spawning'] }).length;
  const pending = listActiveSubagents({ status: 'paused' }).length;

  const successRate = totalTerminal > 0 ? (completed / totalTerminal) * 100 : 0;
  const failureRate = totalTerminal > 0 ? ((failed + cancelled) / totalTerminal) * 100 : 0;

  const completedDurations = instances
    .filter((i) => i.status === 'completed')
    .map((i) => calculateDuration(i))
    .filter((d): d is number => d !== undefined);

  const avgCompletionTimeMs = completedDurations.length > 0
    ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
    : undefined;

  return {
    successRate: Math.round(successRate * 100) / 100,
    failureRate: Math.round(failureRate * 100) / 100,
    avgCompletionTimeMs,
    activeTaskCount: active,
    pendingTaskCount: pending,
  };
}

export function logSessionMetrics(): void {
  const metrics = aggregateSessionMetrics();
  const performance = getPerformanceMetrics();

  logger.info('[SubagentMetrics] Session metrics:', {
    total: metrics.totalInstances,
    active: metrics.activeInstances,
    running: metrics.runningInstances,
    completed: metrics.completedInstances,
    failed: metrics.failedInstances,
    cancelled: metrics.cancelledInstances,
    successRate: performance.successRate,
    avgDuration: metrics.avgDurationMs,
  });
}