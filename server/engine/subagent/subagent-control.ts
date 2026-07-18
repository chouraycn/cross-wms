/**
 * Subagent Control — 子代理控制接口
 *
 * 暂停/恢复/取消子代理。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';
import {
  getActiveSubagent,
  updateSubagentStatus,
  onSubagentStateChange,
  listActiveSubagents,
} from './subagent-registry.state.js';

export type ControlAction = 'pause' | 'resume' | 'cancel' | 'restart';

export interface ControlResult {
  success: boolean;
  action: ControlAction;
  instanceId: string;
  previousStatus?: SubagentStatus;
  newStatus?: SubagentStatus;
  error?: string;
}

export interface ControlHandler {
  canPause?: (instance: SubagentInstance) => boolean | Promise<boolean>;
  canResume?: (instance: SubagentInstance) => boolean | Promise<boolean>;
  canCancel?: (instance: SubagentInstance) => boolean | Promise<boolean>;
  onPause?: (instance: SubagentInstance) => void | Promise<void>;
  onResume?: (instance: SubagentInstance) => void | Promise<void>;
  onCancel?: (instance: SubagentInstance) => void | Promise<void>;
  onRestart?: (instance: SubagentInstance) => void | Promise<void>;
}

let controlHandler: ControlHandler | null = null;

export function setSubagentControlHandler(handler: ControlHandler | null): void {
  controlHandler = handler;
}

export function getSubagentControlHandler(): ControlHandler | null {
  return controlHandler;
}

export async function pauseSubagent(instanceId: string): Promise<ControlResult> {
  const instance = getActiveSubagent(instanceId);

  if (!instance) {
    return {
      success: false,
      action: 'pause',
      instanceId,
      error: 'Subagent instance not found',
    };
  }

  if (instance.status === 'paused') {
    return {
      success: true,
      action: 'pause',
      instanceId,
      previousStatus: instance.status,
      newStatus: instance.status,
    };
  }

  if (instance.status !== 'running' && instance.status !== 'spawning') {
    return {
      success: false,
      action: 'pause',
      instanceId,
      previousStatus: instance.status,
      error: `Cannot pause subagent in status: ${instance.status}`,
    };
  }

  if (controlHandler?.canPause) {
    try {
      const canPause = await controlHandler.canPause(instance);
      if (!canPause) {
        return {
          success: false,
          action: 'pause',
          instanceId,
          previousStatus: instance.status,
          error: 'Subagent cannot be paused',
        };
      }
    } catch (error) {
      return {
        success: false,
        action: 'pause',
        instanceId,
        previousStatus: instance.status,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const previousStatus = instance.status;
  updateSubagentStatus(instanceId, 'paused');

  if (controlHandler?.onPause) {
    try {
      const updated = getActiveSubagent(instanceId);
      if (updated) {
        await controlHandler.onPause(updated);
      }
    } catch (error) {
      logger.error(
        '[SubagentControl] onPause handler error:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  logger.debug(`[SubagentControl] Paused subagent: ${instanceId}`);

  return {
    success: true,
    action: 'pause',
    instanceId,
    previousStatus,
    newStatus: 'paused',
  };
}

export async function resumeSubagent(instanceId: string): Promise<ControlResult> {
  const instance = getActiveSubagent(instanceId);

  if (!instance) {
    return {
      success: false,
      action: 'resume',
      instanceId,
      error: 'Subagent instance not found',
    };
  }

  if (instance.status === 'running') {
    return {
      success: true,
      action: 'resume',
      instanceId,
      previousStatus: instance.status,
      newStatus: instance.status,
    };
  }

  if (instance.status !== 'paused') {
    return {
      success: false,
      action: 'resume',
      instanceId,
      previousStatus: instance.status,
      error: `Cannot resume subagent in status: ${instance.status}`,
    };
  }

  if (controlHandler?.canResume) {
    try {
      const canResume = await controlHandler.canResume(instance);
      if (!canResume) {
        return {
          success: false,
          action: 'resume',
          instanceId,
          previousStatus: instance.status,
          error: 'Subagent cannot be resumed',
        };
      }
    } catch (error) {
      return {
        success: false,
        action: 'resume',
        instanceId,
        previousStatus: instance.status,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const previousStatus = instance.status;
  updateSubagentStatus(instanceId, 'running');

  if (controlHandler?.onResume) {
    try {
      const updated = getActiveSubagent(instanceId);
      if (updated) {
        await controlHandler.onResume(updated);
      }
    } catch (error) {
      logger.error(
        '[SubagentControl] onResume handler error:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  logger.debug(`[SubagentControl] Resumed subagent: ${instanceId}`);

  return {
    success: true,
    action: 'resume',
    instanceId,
    previousStatus,
    newStatus: 'running',
  };
}

export async function cancelSubagent(instanceId: string, reason?: string): Promise<ControlResult> {
  const instance = getActiveSubagent(instanceId);

  if (!instance) {
    return {
      success: false,
      action: 'cancel',
      instanceId,
      error: 'Subagent instance not found',
    };
  }

  if (instance.status === 'cancelled' || instance.status === 'completed' || instance.status === 'failed') {
    return {
      success: true,
      action: 'cancel',
      instanceId,
      previousStatus: instance.status,
      newStatus: instance.status,
    };
  }

  if (controlHandler?.canCancel) {
    try {
      const canCancel = await controlHandler.canCancel(instance);
      if (!canCancel) {
        return {
          success: false,
          action: 'cancel',
          instanceId,
          previousStatus: instance.status,
          error: 'Subagent cannot be cancelled',
        };
      }
    } catch (error) {
      return {
        success: false,
        action: 'cancel',
        instanceId,
        previousStatus: instance.status,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const previousStatus = instance.status;
  updateSubagentStatus(instanceId, 'cancelled', {
    error: reason,
    completedAt: Date.now(),
  });

  if (controlHandler?.onCancel) {
    try {
      const updated = getActiveSubagent(instanceId);
      if (updated) {
        await controlHandler.onCancel(updated);
      }
    } catch (error) {
      logger.error(
        '[SubagentControl] onCancel handler error:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  logger.debug(`[SubagentControl] Cancelled subagent: ${instanceId}`);

  return {
    success: true,
    action: 'cancel',
    instanceId,
    previousStatus,
    newStatus: 'cancelled',
  };
}

export async function restartSubagent(instanceId: string): Promise<ControlResult> {
  const instance = getActiveSubagent(instanceId);

  if (!instance) {
    return {
      success: false,
      action: 'restart',
      instanceId,
      error: 'Subagent instance not found',
    };
  }

  const previousStatus = instance.status;

  if (controlHandler?.onRestart) {
    try {
      await controlHandler.onRestart(instance);
    } catch (error) {
      return {
        success: false,
        action: 'restart',
        instanceId,
        previousStatus,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  updateSubagentStatus(instanceId, 'spawning', {
    startedAt: undefined,
    completedAt: undefined,
    result: undefined,
    error: undefined,
  });

  updateSubagentStatus(instanceId, 'running', {
    startedAt: Date.now(),
  });

  logger.debug(`[SubagentControl] Restarted subagent: ${instanceId}`);

  return {
    success: true,
    action: 'restart',
    instanceId,
    previousStatus,
    newStatus: 'running',
  };
}

export function canPauseSubagent(instanceId: string): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) return false;
  return instance.status === 'running' || instance.status === 'spawning';
}

export function canResumeSubagent(instanceId: string): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) return false;
  return instance.status === 'paused';
}

export function canCancelSubagent(instanceId: string): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) return false;
  return (
    instance.status === 'running' ||
    instance.status === 'spawning' ||
    instance.status === 'paused'
  );
}

export function canRestartSubagent(instanceId: string): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) return false;
  return (
    instance.status === 'completed' ||
    instance.status === 'failed' ||
    instance.status === 'cancelled' ||
    instance.status === 'paused'
  );
}

export async function pauseAllSubagents(parentSessionKey?: string): Promise<ControlResult[]> {
  const instances = listActiveSubagents({
    status: ['running', 'spawning'],
    parentSessionKey,
  });

  const results: ControlResult[] = [];
  for (const instance of instances) {
    const result = await pauseSubagent(instance.id);
    results.push(result);
  }

  return results;
}

export async function resumeAllSubagents(parentSessionKey?: string): Promise<ControlResult[]> {
  const instances = listActiveSubagents({
    status: 'paused',
    parentSessionKey,
  });

  const results: ControlResult[] = [];
  for (const instance of instances) {
    const result = await resumeSubagent(instance.id);
    results.push(result);
  }

  return results;
}

export async function cancelAllSubagents(parentSessionKey?: string): Promise<ControlResult[]> {
  const instances = listActiveSubagents({
    status: ['running', 'spawning', 'paused'],
    parentSessionKey,
  });

  const results: ControlResult[] = [];
  for (const instance of instances) {
    const result = await cancelSubagent(instance.id);
    results.push(result);
  }

  return results;
}

export function watchSubagentStatus(
  instanceId: string,
  callback: (status: SubagentStatus, instance: SubagentInstance) => void,
): () => void {
  return onSubagentStateChange(instanceId, (instance, changeType) => {
    if (changeType !== 'delete') {
      callback(instance.status, instance);
    }
  });
}

export interface SubagentControlState {
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  canRestart: boolean;
}

export function getSubagentControlState(instanceId: string): SubagentControlState {
  return {
    canPause: canPauseSubagent(instanceId),
    canResume: canResumeSubagent(instanceId),
    canCancel: canCancelSubagent(instanceId),
    canRestart: canRestartSubagent(instanceId),
  };
}
