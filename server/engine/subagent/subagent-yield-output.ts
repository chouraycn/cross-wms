/**
 * Subagent Yield Output — 输出产出
 *
 * 管理子代理的产出输出。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent, updateSubagentStatus } from './subagent-registry.state.js';
import { persistSubagent } from './subagent-registry.persistence.js';

export type YieldType = 'progress' | 'message' | 'artifact' | 'final';

export interface YieldOutput {
  type: YieldType;
  content: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface YieldOptions {
  persist?: boolean;
  notify?: boolean;
}

const yieldOutputs = new Map<string, YieldOutput[]>();

export function yieldOutput(
  instanceId: string,
  type: YieldType,
  content: unknown,
  options: YieldOptions = {},
): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    logger.warn(`[SubagentYield] Instance not found: ${instanceId}`);
    return false;
  }

  const output: YieldOutput = {
    type,
    content,
    timestamp: Date.now(),
  };

  const outputs = yieldOutputs.get(instanceId) || [];
  outputs.push(output);
  yieldOutputs.set(instanceId, outputs);

  const currentYieldCount = (instance.metadata?.yieldCount as number) ?? 0;
  updateSubagentStatus(instanceId, instance.status, {
    lastActivityAt: Date.now(),
    metadata: {
      ...instance.metadata,
      yieldCount: currentYieldCount + 1,
    },
  });

  if (options.persist !== false) {
    const currentInstance = getActiveSubagent(instanceId);
    if (currentInstance) {
      persistSubagent(currentInstance);
    }
  }

  logger.debug(`[SubagentYield] Instance ${instanceId} yielded ${type}`);

  return true;
}

export function getYieldOutputs(instanceId: string): YieldOutput[] {
  return yieldOutputs.get(instanceId) || [];
}

export function getLastYieldOutput(instanceId: string): YieldOutput | undefined {
  const outputs = yieldOutputs.get(instanceId);
  return outputs ? outputs[outputs.length - 1] : undefined;
}

export function clearYieldOutputs(instanceId: string): void {
  yieldOutputs.delete(instanceId);
  logger.debug(`[SubagentYield] Cleared outputs for instance ${instanceId}`);
}

export function completeWithYield(
  instanceId: string,
  result: unknown,
  options: YieldOptions = {},
): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    logger.warn(`[SubagentYield] Instance not found for completion: ${instanceId}`);
    return false;
  }

  yieldOutput(instanceId, 'final', result, { persist: false });

  updateSubagentStatus(instanceId, 'completed', {
    result,
    completedAt: Date.now(),
    lastActivityAt: Date.now(),
  });

  if (options.persist !== false) {
    const currentInstance = getActiveSubagent(instanceId);
    if (currentInstance) {
      persistSubagent(currentInstance);
    }
  }

  logger.debug(`[SubagentYield] Instance ${instanceId} completed with result`);

  return true;
}

export function failWithYield(
  instanceId: string,
  error: string,
  options: YieldOptions = {},
): boolean {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    logger.warn(`[SubagentYield] Instance not found for failure: ${instanceId}`);
    return false;
  }

  yieldOutput(instanceId, 'final', { error }, { persist: false });

  updateSubagentStatus(instanceId, 'failed', {
    error,
    completedAt: Date.now(),
    lastActivityAt: Date.now(),
  });

  if (options.persist !== false) {
    const currentInstance = getActiveSubagent(instanceId);
    if (currentInstance) {
      persistSubagent(currentInstance);
    }
  }

  logger.debug(`[SubagentYield] Instance ${instanceId} failed with error: ${error}`);

  return true;
}

export function getYieldStats(instanceId: string): {
  total: number;
  progress: number;
  messages: number;
  artifacts: number;
  final: number;
} {
  const outputs = yieldOutputs.get(instanceId) || [];

  const stats = {
    total: outputs.length,
    progress: 0,
    messages: 0,
    artifacts: 0,
    final: 0,
  };

  for (const output of outputs) {
    switch (output.type) {
      case 'progress':
        stats.progress++;
        break;
      case 'message':
        stats.messages++;
        break;
      case 'artifact':
        stats.artifacts++;
        break;
      case 'final':
        stats.final++;
        break;
    }
  }

  return stats;
}

export function clearAllYieldOutputs(): void {
  yieldOutputs.clear();
  logger.debug('[SubagentYield] Cleared all yield outputs');
}