/**
 * Subagent Registry Queries — 查询接口
 *
 * 提供复杂的子代理实例查询能力。
 */

import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import { listAllSubagentStates } from './subagent-registry.state.js';
import { getSubagentStoreStats } from './subagent-registry.store.js';
import { isActiveStatus, isTerminalStatus, getSpawnDepth, getInstanceAge } from './subagent-registry.helpers.js';

export interface QueryFilter {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string | string[];
  parentSessionKey?: string;
  minDepth?: number;
  maxDepth?: number;
  minAgeMs?: number;
  maxAgeMs?: number;
  hasResult?: boolean;
  hasError?: boolean;
  archived?: boolean;
}

export interface QueryOptions {
  filter?: QueryFilter;
  sortBy?: 'spawnedAt' | 'startedAt' | 'completedAt' | 'lastActivityAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  instances: SubagentInstance[];
  total: number;
  filtered: number;
}

function matchesFilter(instance: SubagentInstance, filter: QueryFilter): boolean {
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (!statuses.includes(instance.status)) {
      return false;
    }
  }

  if (filter.definitionId) {
    const ids = Array.isArray(filter.definitionId) ? filter.definitionId : [filter.definitionId];
    if (!ids.includes(instance.definitionId)) {
      return false;
    }
  }

  if (filter.parentSessionKey && instance.parentSessionKey !== filter.parentSessionKey) {
    return false;
  }

  const depth = getSpawnDepth(instance.sessionKey);
  if (filter.minDepth !== undefined && depth < filter.minDepth) {
    return false;
  }
  if (filter.maxDepth !== undefined && depth > filter.maxDepth) {
    return false;
  }

  const age = getInstanceAge(instance);
  if (filter.minAgeMs !== undefined && age < filter.minAgeMs) {
    return false;
  }
  if (filter.maxAgeMs !== undefined && age > filter.maxAgeMs) {
    return false;
  }

  if (filter.hasResult !== undefined) {
    const hasResult = instance.result !== undefined && instance.result !== null;
    if (filter.hasResult !== hasResult) {
      return false;
    }
  }

  if (filter.hasError !== undefined) {
    const hasError = instance.error !== undefined && instance.error !== null;
    if (filter.hasError !== hasError) {
      return false;
    }
  }

  if (filter.archived !== undefined) {
    const isArchived = instance.metadata?.archived === true;
    if (filter.archived !== isArchived) {
      return false;
    }
  }

  return true;
}

export function querySubagents(options: QueryOptions = {}): QueryResult {
  const all = listAllSubagentStates({ includePersisted: true });
  
  const filtered = 'filter' in options && options.filter !== undefined
    ? all.filter((i) => matchesFilter(i, options.filter!))
    : all;

  const sortBy = options.sortBy ?? 'spawnedAt';
  const sortOrder = options.sortOrder ?? 'desc';
  
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const offset = options.offset ?? 0;
  const limit = options.limit;
  
  const instances = limit !== undefined
    ? sorted.slice(offset, offset + limit)
    : sorted.slice(offset);

  return {
    instances,
    total: all.length,
    filtered: filtered.length,
  };
}

export function getSubagentTree(parentSessionKey: string): SubagentInstance[] {
  const all = listAllSubagentStates({ includePersisted: true });
  const tree: SubagentInstance[] = [];
  const visited = new Set<string>();

  function collect(parentKey: string): void {
    const children = all.filter((i) => i.parentSessionKey === parentKey && !visited.has(i.id));
    for (const child of children) {
      visited.add(child.id);
      tree.push(child);
      collect(child.sessionKey);
    }
  }

  collect(parentSessionKey);
  return tree;
}

export function getSubagentAncestry(sessionKey: string): SubagentInstance[] {
  const all = listAllSubagentStates({ includePersisted: true });
  const ancestry: SubagentInstance[] = [];
  let currentKey = sessionKey;

  while (currentKey) {
    const instance = all.find((i) => i.sessionKey === currentKey);
    if (!instance) break;
    
    if (instance.parentSessionKey) {
      const parent = all.find((i) => i.sessionKey === instance.parentSessionKey);
      if (parent) {
        ancestry.unshift(parent);
        currentKey = parent.parentSessionKey ?? '';
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return ancestry;
}

export function getSubagentStats(): {
  active: number;
  running: number;
  spawning: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
  byDefinition: Record<string, { active: number; total: number }>;
  maxDepth: number;
} {
  const all = listAllSubagentStates({ includePersisted: true });
  const stats = {
    active: 0,
    running: 0,
    spawning: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: all.length,
    byDefinition: {} as Record<string, { active: number; total: number }>,
    maxDepth: 0,
  };

  for (const instance of all) {
    stats.byDefinition[instance.definitionId] = stats.byDefinition[instance.definitionId] ?? { active: 0, total: 0 };
    stats.byDefinition[instance.definitionId].total++;

    if (isActiveStatus(instance.status)) {
      stats.active++;
      stats.byDefinition[instance.definitionId].active++;
    }

    switch (instance.status) {
      case 'running':
        stats.running++;
        break;
      case 'spawning':
        stats.spawning++;
        break;
      case 'paused':
        stats.paused++;
        break;
      case 'completed':
        stats.completed++;
        break;
      case 'failed':
        stats.failed++;
        break;
      case 'cancelled':
        stats.cancelled++;
        break;
    }

    const depth = getSpawnDepth(instance.sessionKey);
    if (depth > stats.maxDepth) {
      stats.maxDepth = depth;
    }
  }

  return stats;
}

export function findStuckSubagents(timeoutMs: number): SubagentInstance[] {
  const all = listAllSubagentStates({ includePersisted: true });
  return all.filter((i) => {
    if (!isActiveStatus(i.status)) return false;
    const startTime = i.startedAt ?? i.spawnedAt;
    return Date.now() - startTime >= timeoutMs;
  });
}

export function findOrphanSubagents(): SubagentInstance[] {
  const all = listAllSubagentStates({ includePersisted: true });
  const sessionKeys = new Set(all.map((i) => i.sessionKey));
  
  return all.filter((i) => {
    if (!i.parentSessionKey) return false;
    return !sessionKeys.has(i.parentSessionKey);
  });
}