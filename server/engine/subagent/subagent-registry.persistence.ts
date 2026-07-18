/**
 * Subagent Registry Persistence — 持久化
 *
 * 管理子代理实例的持久化策略和操作。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import {
  insertSubagentInstance,
  updateSubagentInstance,
  deleteSubagentInstance,
  getSubagentInstance,
  listSubagentInstances,
  isSubagentStoreInitialized,
  cleanupOldSubagentInstances,
} from './subagent-registry.store.js';
import { getActiveSubagent, addActiveSubagent, setActiveSubagent, removeActiveSubagent, invalidatePersistedCache } from './subagent-registry.state.js';
import { isTerminalStatus } from './subagent-registry.helpers.js';

export interface PersistenceOptions {
  skipIfTerminal?: boolean;
  force?: boolean;
}

export interface PersistenceStats {
  persisted: number;
  skipped: number;
  errors: number;
}

const PERSISTENCE_RETRY_DELAY_MS = 1000;
const MAX_PERSISTENCE_RETRIES = 3;

export function persistSubagent(instance: SubagentInstance, options: PersistenceOptions = {}): boolean {
  if (!isSubagentStoreInitialized()) {
    if (options.force) {
      logger.warn('[SubagentPersistence] Store not initialized, cannot persist');
    }
    return false;
  }

  if (options.skipIfTerminal !== false && isTerminalStatus(instance.status)) {
    return false;
  }

  try {
    const existing = getSubagentInstance(instance.id);
    if (existing) {
      updateSubagentInstance(instance);
    } else {
      insertSubagentInstance(instance);
    }
    invalidatePersistedCache();
    return true;
  } catch (error) {
    logger.error(
      `[SubagentPersistence] Failed to persist ${instance.id}:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function persistSubagentWithRetry(
  instance: SubagentInstance,
  options: PersistenceOptions = {},
): Promise<boolean> {
  let attempts = 0;
  while (attempts < MAX_PERSISTENCE_RETRIES) {
    if (persistSubagent(instance, options)) {
      return true;
    }
    attempts++;
    if (attempts < MAX_PERSISTENCE_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, PERSISTENCE_RETRY_DELAY_MS * attempts));
    }
  }
  return false;
}

export function loadSubagentFromStore(instanceId: string): SubagentInstance | undefined {
  if (!isSubagentStoreInitialized()) return undefined;

  try {
    const instance = getSubagentInstance(instanceId);
    if (instance) {
      addActiveSubagent(instance);
      return instance;
    }
    return undefined;
  } catch (error) {
    logger.error(
      `[SubagentPersistence] Failed to load ${instanceId} from store:`,
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

export function loadAllSubagentsFromStore(): number {
  if (!isSubagentStoreInitialized()) return 0;

  try {
    const instances = listSubagentInstances();
    for (const instance of instances) {
      addActiveSubagent(instance);
    }
    invalidatePersistedCache();
    logger.debug(`[SubagentPersistence] Loaded ${instances.length} subagents from store`);
    return instances.length;
  } catch (error) {
    logger.error(
      '[SubagentPersistence] Failed to load subagents from store:',
      error instanceof Error ? error.message : String(error),
    );
    return 0;
  }
}

export function unpersistSubagent(instanceId: string): boolean {
  if (!isSubagentStoreInitialized()) return false;

  try {
    const removed = deleteSubagentInstance(instanceId);
    invalidatePersistedCache();
    return removed;
  } catch (error) {
    logger.error(
      `[SubagentPersistence] Failed to unpersist ${instanceId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export function persistActiveSubagents(options: PersistenceOptions = {}): PersistenceStats {
  const stats: PersistenceStats = {
    persisted: 0,
    skipped: 0,
    errors: 0,
  };

  const active = listSubagentInstances();
  for (const instance of active) {
    try {
      if (persistSubagent(instance, options)) {
        stats.persisted++;
      } else {
        stats.skipped++;
      }
    } catch {
      stats.errors++;
    }
  }

  if (stats.persisted > 0) {
    logger.debug(`[SubagentPersistence] Persisted ${stats.persisted} active subagents`);
  }

  return stats;
}

export function cleanupPersistedSubagents(retentionMs: number): number {
  if (!isSubagentStoreInitialized()) return 0;

  const cleaned = cleanupOldSubagentInstances(retentionMs);
  invalidatePersistedCache();
  return cleaned;
}

export function syncStoreWithActive(): PersistenceStats {
  const stats: PersistenceStats = {
    persisted: 0,
    skipped: 0,
    errors: 0,
  };

  if (!isSubagentStoreInitialized()) return stats;

  try {
    const persisted = listSubagentInstances();
    const activeIds = new Set(persisted.map((i) => i.id));

    const active = listSubagentInstances();
    for (const instance of active) {
      const persistedInstance = persisted.find((i) => i.id === instance.id);
      if (!persistedInstance) {
        try {
          insertSubagentInstance(instance);
          stats.persisted++;
        } catch {
          stats.errors++;
        }
      } else if (persistedInstance.lastActivityAt !== instance.lastActivityAt) {
        try {
          updateSubagentInstance(instance);
          stats.persisted++;
        } catch {
          stats.errors++;
        }
      }
    }

    for (const persistedInstance of persisted) {
      if (!activeIds.has(persistedInstance.id)) {
        try {
          deleteSubagentInstance(persistedInstance.id);
          stats.persisted++;
        } catch {
          stats.errors++;
        }
      }
    }

    invalidatePersistedCache();
    logger.debug(`[SubagentPersistence] Synced store with active: ${stats.persisted} changes`);
  } catch (error) {
    logger.error(
      '[SubagentPersistence] Failed to sync store with active:',
      error instanceof Error ? error.message : String(error),
    );
    stats.errors++;
  }

  return stats;
}