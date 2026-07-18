/**
 * Subagent Registry Helpers — 辅助函数
 *
 * 提供注册表常用的工具函数。
 */

import crypto from 'node:crypto';
import type { SubagentInstance, SubagentStatus, SubagentDefinition } from '../subagentRegistry.js';

export function generateInstanceId(): string {
  return `subagent_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export function generateSessionKey(agentId: string): string {
  return `agent:${agentId}:subagent:${crypto.randomUUID()}`;
}

export function parseSessionKey(sessionKey: string): {
  agentId?: string;
  type?: string;
  id?: string;
} {
  const parts = sessionKey.split(':');
  if (parts.length >= 4) {
    return {
      agentId: parts[1],
      type: parts[2],
      id: parts.slice(3).join(':'),
    };
  }
  return {};
}

export function getSpawnDepth(sessionKey: string): number {
  const match = sessionKey.match(/:subagent:/g);
  return match ? match.length : 0;
}

export function isTerminalStatus(status: SubagentStatus): boolean {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

export function isActiveStatus(status: SubagentStatus): boolean {
  return ['spawning', 'running', 'paused'].includes(status);
}

export function isValidStatusTransition(from: SubagentStatus, to: SubagentStatus): boolean {
  const transitions: Record<SubagentStatus, SubagentStatus[]> = {
    idle: ['spawning'],
    spawning: ['running', 'failed', 'cancelled'],
    running: ['paused', 'completed', 'failed', 'cancelled'],
    paused: ['running', 'cancelled', 'failed'],
    completed: [],
    failed: [],
    cancelled: [],
  };
  return transitions[from]?.includes(to) ?? false;
}

export function calculateDuration(instance: SubagentInstance): number | undefined {
  if (instance.completedAt && instance.startedAt) {
    return instance.completedAt - instance.startedAt;
  }
  if (instance.startedAt) {
    return Date.now() - instance.startedAt;
  }
  return undefined;
}

export function getInstanceAge(instance: SubagentInstance): number {
  return Date.now() - instance.spawnedAt;
}

export function getLastActivityTime(instance: SubagentInstance): number {
  return instance.lastActivityAt ?? instance.startedAt ?? instance.spawnedAt;
}

export function isInstanceTimedOut(
  instance: SubagentInstance,
  timeoutMs: number,
): boolean {
  const startTime = instance.startedAt ?? instance.spawnedAt;
  return Date.now() - startTime >= timeoutMs;
}

export function isInstanceIdle(
  instance: SubagentInstance,
  idleTimeoutMs: number,
): boolean {
  if (!isActiveStatus(instance.status)) {
    return false;
  }
  const lastActivity = getLastActivityTime(instance);
  return Date.now() - lastActivity >= idleTimeoutMs;
}

export function createInstanceFromDefinition(
  definition: SubagentDefinition,
  sessionKey: string,
  params: {
    taskDescription: string;
    parentSessionKey?: string;
    metadata?: Record<string, unknown>;
  },
): SubagentInstance {
  return {
    id: generateInstanceId(),
    definitionId: definition.id,
    name: definition.name,
    status: 'spawning',
    sessionKey,
    parentSessionKey: params.parentSessionKey,
    spawnedAt: Date.now(),
    taskDescription: params.taskDescription,
    metadata: params.metadata,
  };
}

export function cloneInstance(instance: SubagentInstance): SubagentInstance {
  return {
    ...instance,
    metadata: instance.metadata ? { ...instance.metadata } : undefined,
    result: instance.result ? (typeof instance.result === 'object' ? JSON.parse(JSON.stringify(instance.result)) : instance.result) : undefined,
  };
}

export function mergeInstanceMetadata(
  instance: SubagentInstance,
  updates: Record<string, unknown>,
): SubagentInstance {
  return {
    ...instance,
    metadata: {
      ...instance.metadata,
      ...updates,
    },
  };
}

export function truncateTaskDescription(taskDescription: string, maxLength: number = 500): string {
  if (taskDescription.length <= maxLength) {
    return taskDescription;
  }
  return taskDescription.slice(0, maxLength - 3) + '...';
}