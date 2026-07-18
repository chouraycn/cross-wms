/**
 * Subagent Spawn Thread Binding — 线程绑定
 *
 * 处理子代理的线程绑定和通信。
 */

import { logger } from '../../logger.js';
import type { SpawnOptions, SpawnContext, SpawnResult } from './subagent-spawn.types.js';
import { spawnSubagent } from './subagent-spawn.js';
import { resolveSpawnContext } from './subagent-spawn.context.js';

export interface ThreadBindingOptions {
  threadId: string | number;
  channel?: string;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  requiresThread?: boolean;
}

export async function spawnThreadBoundSubagent(
  options: SpawnOptions,
  context: SpawnContext,
  bindingOptions: ThreadBindingOptions,
): Promise<SpawnResult> {
  if (!bindingOptions.threadId) {
    return {
      status: 'error',
      error: 'threadId is required for thread-bound spawn',
    };
  }

  if (!context.agentSessionKey) {
    return {
      status: 'error',
      error: 'agentSessionKey is required for thread-bound spawn',
    };
  }

  const resolvedContext = resolveSpawnContext(context, options, {
    inheritTools: true,
    inheritWorkspace: true,
    inheritMembership: true,
  });

  const spawnOptions: SpawnOptions = {
    ...options,
    mode: 'session',
    thread: true,
    cleanup: 'keep',
  };

  const spawnContext: SpawnContext = {
    ...resolvedContext.inheritedContext,
    agentThreadId: bindingOptions.threadId,
    agentChannel: bindingOptions.channel ?? context.agentChannel,
    agentGroupId: bindingOptions.groupId ?? context.agentGroupId,
    agentGroupChannel: bindingOptions.groupChannel ?? context.agentGroupChannel,
    agentGroupSpace: bindingOptions.groupSpace ?? context.agentGroupSpace,
  };

  logger.debug(
    `[SubagentSpawn] Spawning thread-bound subagent for thread ${bindingOptions.threadId}`,
  );

  const result = await spawnSubagent(spawnOptions, spawnContext);

  if (result.status === 'accepted') {
    logger.debug(`[SubagentSpawn] Thread-bound subagent spawned: ${result.instanceId}`);
  }

  return result;
}

export function validateThreadBinding(
  options: SpawnOptions,
  context: SpawnContext,
  threadId: string | number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!threadId) {
    errors.push('Thread ID is required');
  }

  if (!context.agentSessionKey) {
    errors.push('Agent session key is required');
  }

  if (options.mode === 'run' && options.thread) {
    errors.push('Thread binding requires mode="session"');
  }

  if (context.agentThreadId && threadId !== context.agentThreadId) {
    errors.push('Cannot bind to different thread than parent');
  }

  return { valid: errors.length === 0, errors };
}

export function getThreadBindingContext(
  threadId: string | number,
  context: SpawnContext,
): SpawnContext {
  return {
    ...context,
    agentThreadId: threadId,
    parentSessionKey: context.agentSessionKey ?? context.parentSessionKey,
  };
}