/**
 * Subagent Recovery State — 恢复状态
 *
 * 管理子代理的故障恢复状态。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent, updateSubagentStatus, addActiveSubagent } from './subagent-registry.state.js';
import { getSubagentInstance, listSubagentInstances } from './subagent-registry.store.js';

export type RecoveryState = 'pending' | 'recovering' | 'recovered' | 'failed';

export interface RecoveryInfo {
  instanceId: string;
  state: RecoveryState;
  attemptCount: number;
  lastAttemptAt?: number;
  error?: string;
  recoveryData?: unknown;
}

export interface RecoveryOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  preserveResult?: boolean;
}

const recoveryStates = new Map<string, RecoveryInfo>();
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

export function getRecoveryState(instanceId: string): RecoveryInfo | undefined {
  return recoveryStates.get(instanceId);
}

export function setRecoveryState(instanceId: string, info: RecoveryInfo): void {
  recoveryStates.set(instanceId, info);
}

export function clearRecoveryState(instanceId: string): void {
  recoveryStates.delete(instanceId);
}

export async function attemptRecovery(
  instanceId: string,
  options: RecoveryOptions = {},
): Promise<{ success: boolean; state: RecoveryState; error?: string }> {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    const persisted = getSubagentInstance(instanceId);
    if (!persisted) {
      return { success: false, state: 'failed', error: 'Instance not found' };
    }
  }

  const currentState = recoveryStates.get(instanceId);
  const attemptCount = currentState?.attemptCount ?? 0;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  if (attemptCount >= maxAttempts) {
    setRecoveryState(instanceId, {
      instanceId,
      state: 'failed',
      attemptCount,
      lastAttemptAt: Date.now(),
      error: 'Max recovery attempts exceeded',
    });
    return { success: false, state: 'failed', error: 'Max recovery attempts exceeded' };
  }

  setRecoveryState(instanceId, {
    instanceId,
    state: 'recovering',
    attemptCount: attemptCount + 1,
    lastAttemptAt: Date.now(),
  });

  try {
    await performRecovery(instanceId, options);

    setRecoveryState(instanceId, {
      instanceId,
      state: 'recovered',
      attemptCount: attemptCount + 1,
      lastAttemptAt: Date.now(),
    });

    logger.debug(`[SubagentRecovery] Successfully recovered instance: ${instanceId}`);
    return { success: true, state: 'recovered' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    setRecoveryState(instanceId, {
      instanceId,
      state: attemptCount + 1 >= maxAttempts ? 'failed' : 'pending',
      attemptCount: attemptCount + 1,
      lastAttemptAt: Date.now(),
      error: errorMessage,
    });

    if (attemptCount + 1 < maxAttempts) {
      const delay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
      setTimeout(() => {
        void attemptRecovery(instanceId, options);
      }, delay);
    }

    return { success: false, state: 'failed', error: errorMessage };
  }
}

async function performRecovery(
  instanceId: string,
  options: RecoveryOptions,
): Promise<void> {
  const persisted = getSubagentInstance(instanceId);
  if (!persisted) {
    throw new Error('No persisted state found for recovery');
  }

  if (options.preserveResult !== false && persisted.result) {
    updateSubagentStatus(instanceId, 'completed', {
      result: persisted.result,
      completedAt: persisted.completedAt,
    });
    return;
  }

  const recoveredInstance: SubagentInstance = {
    ...persisted,
    status: 'running',
    spawnedAt: Date.now(),
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    completedAt: undefined,
    result: undefined,
    error: undefined,
  };

  addActiveSubagent(recoveredInstance);
  logger.debug(`[SubagentRecovery] Restored instance: ${instanceId}`);
}

export function getRecoveryStats(): {
  pending: number;
  recovering: number;
  recovered: number;
  failed: number;
  total: number;
} {
  const stats: {
    pending: number;
    recovering: number;
    recovered: number;
    failed: number;
    total: number;
  } = {
    pending: 0,
    recovering: 0,
    recovered: 0,
    failed: 0,
    total: recoveryStates.size,
  };

  for (const info of recoveryStates.values()) {
    switch (info.state) {
      case 'pending':
        stats.pending++;
        break;
      case 'recovering':
        stats.recovering++;
        break;
      case 'recovered':
        stats.recovered++;
        break;
      case 'failed':
        stats.failed++;
        break;
    }
  }

  return stats;
}

export function clearAllRecoveryStates(): void {
  recoveryStates.clear();
  logger.debug('[SubagentRecovery] Cleared all recovery states');
}