/**
 * Subagent Registry Run Manager — 运行管理
 *
 * 管理子代理的运行状态和生命周期转换。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import { getActiveSubagent, setActiveSubagent, updateSubagentStatus, addActiveSubagent } from './subagent-registry.state.js';
import { isValidStatusTransition, generateInstanceId, generateSessionKey } from './subagent-registry.helpers.js';

export interface RunTransitionResult {
  success: boolean;
  instance?: SubagentInstance;
  previousStatus?: SubagentStatus;
  error?: string;
}

export interface StartOptions {
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface CompleteOptions {
  result?: unknown;
  metadata?: Record<string, unknown>;
}

export interface FailOptions {
  error?: string;
  metadata?: Record<string, unknown>;
}

export function startSubagent(instanceId: string, options: StartOptions = {}): RunTransitionResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (!isValidStatusTransition(instance.status, 'running')) {
    return {
      success: false,
      previousStatus: instance.status,
      error: `Cannot transition from ${instance.status} to running`,
    };
  }

  const previousStatus = instance.status;
  const updates: Partial<SubagentInstance> = {
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  if (options.timeoutMs) {
    updates.metadata = {
      ...instance.metadata,
      timeoutMs: options.timeoutMs,
      timeoutAt: Date.now() + options.timeoutMs,
    };
  } else if (options.metadata) {
    updates.metadata = { ...instance.metadata, ...options.metadata };
  }

  updateSubagentStatus(instanceId, 'running', updates);
  logger.debug(`[SubagentRunManager] Started subagent: ${instanceId}`);

  return {
    success: true,
    instance: getActiveSubagent(instanceId),
    previousStatus,
  };
}

export function pauseSubagent(instanceId: string): RunTransitionResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (!isValidStatusTransition(instance.status, 'paused')) {
    return {
      success: false,
      previousStatus: instance.status,
      error: `Cannot transition from ${instance.status} to paused`,
    };
  }

  const previousStatus = instance.status;
  updateSubagentStatus(instanceId, 'paused', { lastActivityAt: Date.now() });
  logger.debug(`[SubagentRunManager] Paused subagent: ${instanceId}`);

  return {
    success: true,
    instance: getActiveSubagent(instanceId),
    previousStatus,
  };
}

export function resumeSubagent(instanceId: string): RunTransitionResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (!isValidStatusTransition(instance.status, 'running')) {
    return {
      success: false,
      previousStatus: instance.status,
      error: `Cannot transition from ${instance.status} to running`,
    };
  }

  const previousStatus = instance.status;
  updateSubagentStatus(instanceId, 'running', { lastActivityAt: Date.now() });
  logger.debug(`[SubagentRunManager] Resumed subagent: ${instanceId}`);

  return {
    success: true,
    instance: getActiveSubagent(instanceId),
    previousStatus,
  };
}

export function completeSubagent(instanceId: string, options: CompleteOptions = {}): RunTransitionResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (!isValidStatusTransition(instance.status, 'completed')) {
    return {
      success: false,
      previousStatus: instance.status,
      error: `Cannot transition from ${instance.status} to completed`,
    };
  }

  const previousStatus = instance.status;
  const updates: Partial<SubagentInstance> = {
    completedAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  if (options.result !== undefined) {
    updates.result = options.result;
  }

  if (options.metadata) {
    updates.metadata = { ...instance.metadata, ...options.metadata };
  }

  updateSubagentStatus(instanceId, 'completed', updates);
  logger.debug(`[SubagentRunManager] Completed subagent: ${instanceId}`);

  return {
    success: true,
    instance: getActiveSubagent(instanceId),
    previousStatus,
  };
}

export function failSubagent(instanceId: string, options: FailOptions = {}): RunTransitionResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (!isValidStatusTransition(instance.status, 'failed')) {
    return {
      success: false,
      previousStatus: instance.status,
      error: `Cannot transition from ${instance.status} to failed`,
    };
  }

  const previousStatus = instance.status;
  const updates: Partial<SubagentInstance> = {
    completedAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  if (options.error !== undefined) {
    updates.error = options.error;
  }

  if (options.metadata) {
    updates.metadata = { ...instance.metadata, ...options.metadata };
  }

  updateSubagentStatus(instanceId, 'failed', updates);
  logger.debug(`[SubagentRunManager] Failed subagent: ${instanceId}`);

  return {
    success: true,
    instance: getActiveSubagent(instanceId),
    previousStatus,
  };
}

export function cancelSubagent(instanceId: string, reason?: string): RunTransitionResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (!isValidStatusTransition(instance.status, 'cancelled')) {
    return {
      success: false,
      previousStatus: instance.status,
      error: `Cannot transition from ${instance.status} to cancelled`,
    };
  }

  const previousStatus = instance.status;
  const updates: Partial<SubagentInstance> = {
    completedAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  if (reason) {
    updates.error = reason;
  }

  updateSubagentStatus(instanceId, 'cancelled', updates);
  logger.debug(`[SubagentRunManager] Cancelled subagent: ${instanceId}`);

  return {
    success: true,
    instance: getActiveSubagent(instanceId),
    previousStatus,
  };
}

export function heartbeatSubagent(instanceId: string): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) return false;

  updateSubagentStatus(instanceId, instance.status, { lastActivityAt: Date.now() });
  return true;
}

export function createRunningSubagent(
  definitionId: string,
  name: string,
  taskDescription: string,
  parentSessionKey?: string,
  metadata?: Record<string, unknown>,
): SubagentInstance {
  const sessionKey = generateSessionKey(definitionId);
  const instance: SubagentInstance = {
    id: generateInstanceId(),
    definitionId,
    name,
    status: 'running',
    sessionKey,
    parentSessionKey,
    spawnedAt: Date.now(),
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    taskDescription,
    metadata,
  };

  addActiveSubagent(instance);
  logger.debug(`[SubagentRunManager] Created running subagent: ${instance.id}`);
  return instance;
}