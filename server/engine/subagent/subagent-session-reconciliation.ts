/**
 * Subagent Session Reconciliation — 会话协调
 *
 * 协调内存状态和持久化存储之间的差异。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import { listActiveSubagents, addActiveSubagent, removeActiveSubagent, updateSubagentStatus } from './subagent-registry.state.js';
import { listSubagentInstances, getSubagentInstance } from './subagent-registry.store.js';
import { isTerminalStatus, isActiveStatus } from './subagent-registry.helpers.js';

export interface ReconciliationResult {
  synchronized: number;
  activated: number;
  deactivated: number;
  errors: string[];
}

export interface ReconciliationOptions {
  autoActivate?: boolean;
  autoDeactivate?: boolean;
  forceStatusSync?: boolean;
}

export function reconcileSessions(options: ReconciliationOptions = {}): ReconciliationResult {
  const result: ReconciliationResult = {
    synchronized: 0,
    activated: 0,
    deactivated: 0,
    errors: [],
  };

  const activeInstances = listActiveSubagents();
  const persistedInstances = listSubagentInstances();

  const activeById = new Map(activeInstances.map((i) => [i.id, i]));
  const persistedById = new Map(persistedInstances.map((i) => [i.id, i]));

  for (const [instanceId, persisted] of persistedById) {
    const active = activeById.get(instanceId);

    if (!active) {
      if (options.autoActivate !== false && isActiveStatus(persisted.status)) {
        try {
          addActiveSubagent(persisted);
          result.activated++;
          logger.debug(`[SubagentReconciliation] Activated persisted instance: ${instanceId}`);
        } catch (error) {
          result.errors.push(`Failed to activate ${instanceId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else {
      if (options.forceStatusSync !== false && active.status !== persisted.status) {
        try {
          updateSubagentStatus(instanceId, persisted.status);
          result.synchronized++;
        } catch (error) {
          result.errors.push(`Failed to sync ${instanceId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  for (const [instanceId, active] of activeById) {
    const persisted = persistedById.get(instanceId);

    if (!persisted) {
      if (options.autoDeactivate !== false && isTerminalStatus(active.status)) {
        try {
          removeActiveSubagent(instanceId);
          result.deactivated++;
          logger.debug(`[SubagentReconciliation] Deactivated non-persisted instance: ${instanceId}`);
        } catch (error) {
          result.errors.push(`Failed to deactivate ${instanceId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  if (result.synchronized + result.activated + result.deactivated > 0) {
    logger.debug(
      `[SubagentReconciliation] Reconciled: ${result.synchronized} synced, ${result.activated} activated, ${result.deactivated} deactivated`,
    );
  }

  return result;
}

export function detectConflicts(): Array<{
  instanceId: string;
  activeStatus: SubagentStatus;
  persistedStatus: SubagentStatus;
}> {
  const activeInstances = listActiveSubagents();
  const persistedInstances = listSubagentInstances();

  const activeById = new Map(activeInstances.map((i) => [i.id, i]));
  const persistedById = new Map(persistedInstances.map((i) => [i.id, i]));

  const conflicts: Array<{
    instanceId: string;
    activeStatus: SubagentStatus;
    persistedStatus: SubagentStatus;
  }> = [];

  for (const [instanceId, active] of activeById) {
    const persisted = persistedById.get(instanceId);
    if (persisted && active.status !== persisted.status) {
      conflicts.push({
        instanceId,
        activeStatus: active.status,
        persistedStatus: persisted.status,
      });
    }
  }

  return conflicts;
}

export function resolveConflict(
  instanceId: string,
  source: 'active' | 'persisted',
): boolean {
  const active = listActiveSubagents().find((i) => i.id === instanceId);
  const persisted = getSubagentInstance(instanceId);

  if (!active || !persisted) {
    return false;
  }

  if (source === 'active') {
    updateSubagentStatus(instanceId, active.status);
    logger.debug(`[SubagentReconciliation] Resolved conflict for ${instanceId} using active state`);
  } else {
    updateSubagentStatus(instanceId, persisted.status);
    logger.debug(`[SubagentReconciliation] Resolved conflict for ${instanceId} using persisted state`);
  }

  return true;
}

export function resolveAllConflicts(source: 'active' | 'persisted'): number {
  const conflicts = detectConflicts();
  let resolved = 0;

  for (const conflict of conflicts) {
    if (resolveConflict(conflict.instanceId, source)) {
      resolved++;
    }
  }

  if (resolved > 0) {
    logger.debug(`[SubagentReconciliation] Resolved ${resolved} conflicts using ${source} source`);
  }

  return resolved;
}