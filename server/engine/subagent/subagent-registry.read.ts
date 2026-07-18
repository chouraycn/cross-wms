/**
 * Subagent Registry Read — 读取操作
 *
 * 提供统一的子代理实例读取接口。
 */

import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import { getActiveSubagent, getSubagentState, listActiveSubagents, listAllSubagentStates } from './subagent-registry.state.js';
import { getSubagentInstance, getSubagentInstanceBySessionKey, listSubagentInstances } from './subagent-registry.store.js';

export interface ReadOptions {
  preferActive?: boolean;
  includePersisted?: boolean;
}

export function readSubagent(instanceId: string, options: ReadOptions = {}): SubagentInstance | undefined {
  if (options.preferActive !== false) {
    const active = getActiveSubagent(instanceId);
    if (active) return active;
  }

  if (options.includePersisted !== false) {
    return getSubagentState(instanceId);
  }

  return undefined;
}

export function readSubagentBySessionKey(sessionKey: string, options: ReadOptions = {}): SubagentInstance | undefined {
  if (options.preferActive !== false) {
    const active = listActiveSubagents().find((i) => i.sessionKey === sessionKey);
    if (active) return active;
  }

  if (options.includePersisted !== false) {
    return getSubagentInstanceBySessionKey(sessionKey);
  }

  return undefined;
}

export function readAllSubagents(options: {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string;
  parentSessionKey?: string;
  includePersisted?: boolean;
} = {}): SubagentInstance[] {
  if (options.includePersisted !== false) {
    return listAllSubagentStates({
      status: options.status,
      definitionId: options.definitionId,
      parentSessionKey: options.parentSessionKey,
      includePersisted: true,
    });
  }

  return listActiveSubagents({
    status: options.status,
    definitionId: options.definitionId,
    parentSessionKey: options.parentSessionKey,
  });
}

export function readActiveSubagents(options: {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string;
  parentSessionKey?: string;
} = {}): SubagentInstance[] {
  return listActiveSubagents({
    status: options.status,
    definitionId: options.definitionId,
    parentSessionKey: options.parentSessionKey,
  });
}

export function readPersistedSubagents(options: {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string;
  parentSessionKey?: string;
} = {}): SubagentInstance[] {
  return listSubagentInstances(options);
}

export function readSubagentStatus(instanceId: string): SubagentStatus | undefined {
  const instance = readSubagent(instanceId);
  return instance?.status;
}

export function readSubagentDefinitionId(instanceId: string): string | undefined {
  const instance = readSubagent(instanceId);
  return instance?.definitionId;
}

export function readSubagentResult(instanceId: string): unknown {
  const instance = readSubagent(instanceId);
  return instance?.result;
}

export function readSubagentError(instanceId: string): string | undefined {
  const instance = readSubagent(instanceId);
  return instance?.error;
}

export function readSubagentMetadata(instanceId: string): Record<string, unknown> | undefined {
  const instance = readSubagent(instanceId);
  return instance?.metadata;
}

export function readSubagentTimestamps(instanceId: string): {
  spawnedAt: number;
  startedAt?: number;
  completedAt?: number;
  lastActivityAt?: number;
} | undefined {
  const instance = readSubagent(instanceId);
  if (!instance) return undefined;

  return {
    spawnedAt: instance.spawnedAt,
    startedAt: instance.startedAt,
    completedAt: instance.completedAt,
    lastActivityAt: instance.lastActivityAt,
  };
}