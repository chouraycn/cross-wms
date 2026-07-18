/**
 * Subagent Registry State — 内存状态管理
 *
 * 活跃子代理缓存和状态变更通知。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import {
  insertSubagentInstance,
  updateSubagentInstance,
  deleteSubagentInstance,
  getSubagentInstance as getFromStore,
  listSubagentInstances as listFromStore,
  isSubagentStoreInitialized,
} from './subagent-registry.store.js';

type StateChangeListener = (instance: SubagentInstance, changeType: 'create' | 'update' | 'delete') => void;

const activeInstances = new Map<string, SubagentInstance>();
const listeners = new Map<string, Set<StateChangeListener>>();
const globalListeners = new Set<StateChangeListener>();

const STATE_READ_CACHE_TTL_MS = 500;
let persistedCache: { loadedAt: number; instances: Map<string, SubagentInstance> } | null = null;

export function getActiveSubagent(instanceId: string): SubagentInstance | undefined {
  return activeInstances.get(instanceId);
}

export function setActiveSubagent(instance: SubagentInstance): void {
  activeInstances.set(instance.id, instance);
  notifyListeners(instance, 'update');
  persistToStore(instance, 'update');
}

export function addActiveSubagent(instance: SubagentInstance): boolean {
  activeInstances.set(instance.id, instance);
  notifyListeners(instance, 'create');
  persistToStore(instance, 'create');
  return true;
}

export function removeActiveSubagent(instanceId: string): boolean {
  const instance = activeInstances.get(instanceId);
  if (!instance) return false;

  activeInstances.delete(instanceId);
  notifyListeners(instance, 'delete');

  if (isSubagentStoreInitialized()) {
    deleteSubagentInstance(instanceId);
  }

  return true;
}

export function listActiveSubagents(options?: {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string;
  parentSessionKey?: string;
}): SubagentInstance[] {
  let instances = Array.from(activeInstances.values());

  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    instances = instances.filter((i) => statuses.includes(i.status));
  }

  if (options?.definitionId) {
    instances = instances.filter((i) => i.definitionId === options.definitionId);
  }

  if (options?.parentSessionKey) {
    instances = instances.filter((i) => i.parentSessionKey === options.parentSessionKey);
  }

  return instances.sort((a, b) => b.spawnedAt - a.spawnedAt);
}

export function getSubagentState(instanceId: string): SubagentInstance | undefined {
  const active = activeInstances.get(instanceId);
  if (active) return active;

  if (isSubagentStoreInitialized()) {
    return getFromStore(instanceId);
  }

  return undefined;
}

export function listAllSubagentStates(options?: {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string;
  parentSessionKey?: string;
  includePersisted?: boolean;
}): SubagentInstance[] {
  const result = new Map<string, SubagentInstance>();

  if (options?.includePersisted !== false && isSubagentStoreInitialized()) {
    const persisted = loadPersistedSnapshot();
    for (const instance of persisted.values()) {
      result.set(instance.id, instance);
    }
  }

  for (const instance of activeInstances.values()) {
    result.set(instance.id, instance);
  }

  let instances = Array.from(result.values());

  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    instances = instances.filter((i) => statuses.includes(i.status));
  }

  if (options?.definitionId) {
    instances = instances.filter((i) => i.definitionId === options.definitionId);
  }

  if (options?.parentSessionKey) {
    instances = instances.filter((i) => i.parentSessionKey === options.parentSessionKey);
  }

  return instances.sort((a, b) => b.spawnedAt - a.spawnedAt);
}

function loadPersistedSnapshot(): Map<string, SubagentInstance> {
  const now = Date.now();
  if (persistedCache && now - persistedCache.loadedAt < STATE_READ_CACHE_TTL_MS) {
    return persistedCache.instances;
  }

  const instances = listFromStore();
  const instanceMap = new Map<string, SubagentInstance>();
  for (const inst of instances) {
    instanceMap.set(inst.id, inst);
  }

  persistedCache = {
    loadedAt: now,
    instances: instanceMap,
  };

  return instanceMap;
}

export function invalidatePersistedCache(): void {
  persistedCache = null;
}

function persistToStore(instance: SubagentInstance, changeType: 'create' | 'update'): void {
  if (!isSubagentStoreInitialized()) return;

  try {
    if (changeType === 'create') {
      insertSubagentInstance(instance);
    } else {
      updateSubagentInstance(instance);
    }
    invalidatePersistedCache();
  } catch (error) {
    logger.error(
      '[SubagentState] Failed to persist to store:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function onSubagentStateChange(
  instanceId: string,
  listener: StateChangeListener,
): () => void {
  let instanceListeners = listeners.get(instanceId);
  if (!instanceListeners) {
    instanceListeners = new Set();
    listeners.set(instanceId, instanceListeners);
  }
  instanceListeners.add(listener);
  return () => {
    instanceListeners?.delete(listener);
  };
}

export function onAnySubagentStateChange(listener: StateChangeListener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

function notifyListeners(instance: SubagentInstance, changeType: 'create' | 'update' | 'delete'): void {
  const instanceListeners = listeners.get(instance.id);
  if (instanceListeners) {
    for (const listener of instanceListeners) {
      try {
        listener(instance, changeType);
      } catch (error) {
        logger.error(
          '[SubagentState] Listener error:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  for (const listener of globalListeners) {
    try {
      listener(instance, changeType);
    } catch (error) {
      logger.error(
        '[SubagentState] Global listener error:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export function updateSubagentStatus(
  instanceId: string,
  status: SubagentStatus,
  updates?: Partial<SubagentInstance>,
): boolean {
  const instance = activeInstances.get(instanceId);
  if (!instance) return false;

  const updated: SubagentInstance = {
    ...instance,
    status,
    lastActivityAt: Date.now(),
    ...updates,
  };

  activeInstances.set(instanceId, updated);
  notifyListeners(updated, 'update');
  persistToStore(updated, 'update');

  return true;
}

export function getActiveSubagentCount(): number {
  return activeInstances.size;
}

export function getRunningSubagentCount(): number {
  let count = 0;
  for (const instance of activeInstances.values()) {
    if (instance.status === 'running' || instance.status === 'spawning') {
      count++;
    }
  }
  return count;
}

export function clearActiveSubagents(): void {
  for (const instance of activeInstances.values()) {
    notifyListeners(instance, 'delete');
  }
  activeInstances.clear();
  listeners.clear();
}

export function getSubagentStateStats(): {
  active: number;
  running: number;
  total: number;
} {
  const active = activeInstances.size;
  let running = 0;
  for (const inst of activeInstances.values()) {
    if (inst.status === 'running' || inst.status === 'spawning') {
      running++;
    }
  }

  let total = active;
  if (isSubagentStoreInitialized()) {
    const persisted = loadPersistedSnapshot();
    total = persisted.size;
  }

  return { active, running, total };
}
