/**
 * Subagent Orphan Recovery — 孤儿恢复
 *
 * 检测和恢复父代理已消失的子代理。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { listActiveSubagents, updateSubagentStatus, addActiveSubagent } from './subagent-registry.state.js';
import { listSubagentInstances } from './subagent-registry.store.js';
import { findOrphanSubagents } from './subagent-registry.queries.js';

export interface OrphanRecoveryResult {
  detected: number;
  recovered: number;
  cancelled: number;
  errors: string[];
}

export interface OrphanRecoveryOptions {
  autoRecover?: boolean;
  autoCancel?: boolean;
  recoveryDelayMs?: number;
}

const DEFAULT_RECOVERY_DELAY_MS = 60 * 1000;

export function detectOrphans(): SubagentInstance[] {
  const orphans = findOrphanSubagents();
  logger.debug(`[SubagentOrphanRecovery] Detected ${orphans.length} orphan subagents`);
  return orphans;
}

export function isOrphan(instance: SubagentInstance): boolean {
  if (!instance.parentSessionKey) {
    return false;
  }

  const all = listActiveSubagents();
  return !all.some((i) => i.sessionKey === instance.parentSessionKey);
}

export async function recoverOrphans(options: OrphanRecoveryOptions = {}): Promise<OrphanRecoveryResult> {
  const result: OrphanRecoveryResult = {
    detected: 0,
    recovered: 0,
    cancelled: 0,
    errors: [],
  };

  const orphans = detectOrphans();
  result.detected = orphans.length;

  for (const orphan of orphans) {
    try {
      if (options.autoRecover !== false) {
        const recoveryResult = await attemptRecovery(orphan, options);
        if (recoveryResult) {
          result.recovered++;
        } else if (options.autoCancel !== false) {
          updateSubagentStatus(orphan.id, 'cancelled', {
            error: 'Parent session not found, orphan cancelled',
            completedAt: Date.now(),
          });
          result.cancelled++;
        }
      } else if (options.autoCancel !== false) {
        updateSubagentStatus(orphan.id, 'cancelled', {
          error: 'Parent session not found, orphan cancelled',
          completedAt: Date.now(),
        });
        result.cancelled++;
      }
    } catch (error) {
      result.errors.push(`Failed to process orphan ${orphan.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (result.recovered > 0 || result.cancelled > 0) {
    logger.info(
      `[SubagentOrphanRecovery] Processed ${result.detected} orphans: ${result.recovered} recovered, ${result.cancelled} cancelled`,
    );
  }

  return result;
}

async function attemptRecovery(
  instance: SubagentInstance,
  options: OrphanRecoveryOptions,
): Promise<boolean> {
  const recoveryDelayMs = options.recoveryDelayMs ?? DEFAULT_RECOVERY_DELAY_MS;

  await new Promise((resolve) => setTimeout(resolve, recoveryDelayMs));

  if (!isOrphan(instance)) {
    return true;
  }

  const persisted = listSubagentInstances().find((i) => i.id === instance.id);
  if (persisted) {
    addActiveSubagent(persisted);
    logger.debug(`[SubagentOrphanRecovery] Recovered orphan: ${instance.id}`);
    return true;
  }

  return false;
}

export function getOrphanStats(): {
  total: number;
  running: number;
  paused: number;
  completed: number;
} {
  const orphans = detectOrphans();

  return {
    total: orphans.length,
    running: orphans.filter((i) => i.status === 'running').length,
    paused: orphans.filter((i) => i.status === 'paused').length,
    completed: orphans.filter((i) => i.status === 'completed').length,
  };
}