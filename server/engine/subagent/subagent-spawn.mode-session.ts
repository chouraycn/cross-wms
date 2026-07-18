/**
 * Subagent Spawn Mode Session — 模式会话
 *
 * 处理子代理的会话模式生成。
 */

import { logger } from '../../logger.js';
import type { SpawnOptions, SpawnContext, SpawnResult } from './subagent-spawn.types.js';
import { spawnSubagent } from './subagent-spawn.js';
import { resolveSpawnContext } from './subagent-spawn.context.js';

export interface ModeSessionOptions {
  threadId?: string | number;
  channel?: string;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  requiresThread?: boolean;
}

export async function spawnModeSessionSubagent(
  options: SpawnOptions,
  context: SpawnContext,
  sessionOptions: ModeSessionOptions = {},
): Promise<SpawnResult> {
  if (!context.agentSessionKey) {
    return {
      status: 'error',
      error: 'agentSessionKey is required for mode-session spawn',
    };
  }

  const resolvedContext = resolveSpawnContext(context, options, {
    inheritTools: true,
    inheritWorkspace: true,
    inheritMembership: true,
  });

  if (resolvedContext.warnings.length > 0) {
    for (const warning of resolvedContext.warnings) {
      logger.warn(`[SubagentSpawn] ${warning}`);
    }
  }

  const spawnOptions: SpawnOptions = {
    ...options,
    mode: 'session',
    thread: true,
    cleanup: 'keep',
  };

  const spawnContext: SpawnContext = {
    ...resolvedContext.inheritedContext,
    agentThreadId: sessionOptions.threadId ?? context.agentThreadId,
    agentChannel: sessionOptions.channel ?? context.agentChannel,
    agentGroupId: sessionOptions.groupId ?? context.agentGroupId,
    agentGroupChannel: sessionOptions.groupChannel ?? context.agentGroupChannel,
    agentGroupSpace: sessionOptions.groupSpace ?? context.agentGroupSpace,
  };

  if (!spawnContext.agentThreadId && sessionOptions.requiresThread !== false) {
    return {
      status: 'error',
      error: 'threadId is required for mode-session spawn',
    };
  }

  logger.debug(
    `[SubagentSpawn] Spawning mode-session subagent for thread ${spawnContext.agentThreadId}`,
  );

  return spawnSubagent(spawnOptions, spawnContext);
}

export function isSessionModeAvailable(options: SpawnOptions, context: SpawnContext): boolean {
  if (!context.agentSessionKey) return false;
  if (!context.agentThreadId && options.thread !== true) return false;
  if (options.mode === 'run') return false;
  return true;
}

export function getSessionModeConstraints(): {
  requiresThread: boolean;
  cleanupPolicy: 'keep';
  minDepth: number;
  maxDepth: number;
} {
  return {
    requiresThread: true,
    cleanupPolicy: 'keep',
    minDepth: 0,
    maxDepth: 5,
  };
}