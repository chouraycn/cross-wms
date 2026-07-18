/**
 * Subagent Registry Archive — 存档管理
 *
 * 处理子代理实例的归档、恢复和历史查询。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import {
  listSubagentInstances,
  updateSubagentInstance,
  deleteSubagentInstance,
  getSubagentInstance,
} from './subagent-registry.store.js';
import { getActiveSubagent, removeActiveSubagent } from './subagent-registry.state.js';

export interface ArchiveOptions {
  status?: SubagentStatus | SubagentStatus[];
  olderThanMs?: number;
  keepCount?: number;
}

export interface ArchiveResult {
  archived: number;
  skipped: number;
  errors: string[];
}

export interface RestoreResult {
  success: boolean;
  instance?: SubagentInstance;
  error?: string;
}

const DEFAULT_KEEP_COUNT = 100;
const DEFAULT_ARCHIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function isInstanceArchivable(instance: SubagentInstance, options: ArchiveOptions): boolean {
  const terminalStatuses: SubagentStatus[] = ['completed', 'failed', 'cancelled'];
  
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    if (!statuses.includes(instance.status)) {
      return false;
    }
  } else {
    if (!terminalStatuses.includes(instance.status)) {
      return false;
    }
  }

  if (options.olderThanMs) {
    const completedAt = instance.completedAt ?? instance.spawnedAt;
    if (Date.now() - completedAt < options.olderThanMs) {
      return false;
    }
  }

  return true;
}

function markInstanceAsArchived(instance: SubagentInstance): SubagentInstance {
  return {
    ...instance,
    metadata: {
      ...instance.metadata,
      archived: true,
      archivedAt: Date.now(),
    },
  };
}

export async function archiveSubagents(options: ArchiveOptions = {}): Promise<ArchiveResult> {
  const result: ArchiveResult = {
    archived: 0,
    skipped: 0,
    errors: [],
  };

  const olderThanMs = options.olderThanMs ?? DEFAULT_ARCHIVE_THRESHOLD_MS;
  const keepCount = options.keepCount ?? DEFAULT_KEEP_COUNT;

  const instances = listSubagentInstances({
    status: options.status ?? ['completed', 'failed', 'cancelled'],
  });

  const archivable = instances.filter((i) => isInstanceArchivable(i, { ...options, olderThanMs }));
  const sorted = archivable.sort((a, b) => (b.completedAt ?? b.spawnedAt) - (a.completedAt ?? a.spawnedAt));
  const toArchive = sorted.slice(keepCount);

  for (const instance of toArchive) {
    try {
      const active = getActiveSubagent(instance.id);
      if (active) {
        removeActiveSubagent(instance.id);
      }

      const archived = markInstanceAsArchived(instance);
      updateSubagentInstance(archived);
      result.archived++;
    } catch (error) {
      result.errors.push(`Failed to archive ${instance.id}: ${error instanceof Error ? error.message : String(error)}`);
      result.skipped++;
    }
  }

  if (result.archived > 0) {
    logger.debug(`[SubagentArchive] Archived ${result.archived} subagent instances`);
  }

  return result;
}

export async function archiveSubagent(instanceId: string): Promise<boolean> {
  const instance = getSubagentInstance(instanceId);
  if (!instance) return false;

  if (!isInstanceArchivable(instance, {})) {
    logger.warn(`[SubagentArchive] Instance ${instanceId} is not archivable (status: ${instance.status})`);
    return false;
  }

  try {
    const active = getActiveSubagent(instanceId);
    if (active) {
      removeActiveSubagent(instanceId);
    }

    const archived = markInstanceAsArchived(instance);
    updateSubagentInstance(archived);
    logger.debug(`[SubagentArchive] Archived subagent instance: ${instanceId}`);
    return true;
  } catch (error) {
    logger.error(
      `[SubagentArchive] Failed to archive ${instanceId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export function listArchivedSubagents(options?: {
  limit?: number;
  offset?: number;
}): SubagentInstance[] {
  const all = listSubagentInstances();
  const archived = all.filter((i) => i.metadata?.archived === true);
  
  if (options?.limit) {
    return archived.slice(options.offset ?? 0, (options.offset ?? 0) + options.limit);
  }
  
  return archived.slice(options?.offset ?? 0);
}

export function countArchivedSubagents(): number {
  const all = listSubagentInstances();
  return all.filter((i) => i.metadata?.archived === true).length;
}

export function restoreSubagent(instanceId: string): RestoreResult {
  const instance = getSubagentInstance(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (instance.metadata?.archived !== true) {
    return { success: false, error: 'Instance is not archived' };
  }

  try {
    const restored: SubagentInstance = {
      ...instance,
      metadata: {
        ...instance.metadata,
        archived: undefined,
        archivedAt: undefined,
        restoredAt: Date.now(),
      },
    };
    updateSubagentInstance(restored);
    logger.debug(`[SubagentArchive] Restored subagent instance: ${instanceId}`);
    return { success: true, instance: restored };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function purgeArchivedSubagents(olderThanMs?: number): Promise<number> {
  const threshold = olderThanMs ?? DEFAULT_ARCHIVE_THRESHOLD_MS * 2;
  const archived = listArchivedSubagents();
  
  let purged = 0;
  for (const instance of archived) {
    const archivedAt = Number(instance.metadata?.archivedAt) ?? instance.completedAt ?? instance.spawnedAt;
    if (Date.now() - archivedAt >= threshold) {
      try {
        deleteSubagentInstance(instance.id);
        purged++;
      } catch (error) {
        logger.error(
          `[SubagentArchive] Failed to purge ${instance.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  if (purged > 0) {
    logger.debug(`[SubagentArchive] Purged ${purged} archived subagent instances`);
  }

  return purged;
}