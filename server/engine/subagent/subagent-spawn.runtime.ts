/**
 * Subagent Spawn Runtime — 运行时生成
 *
 * 处理子代理的运行时配置和生成。
 */

import { logger } from '../../logger.js';
import type { SpawnOptions, SpawnContext, SpawnResult } from './subagent-spawn.types.js';
import { spawnSubagent } from './subagent-spawn.js';
import { resolveSpawnContext } from './subagent-spawn.context.js';
import { validateOwnership } from './subagent-spawn.ownership.js';
import { processAttachments } from './subagent-spawn.attachments.js';
import { getSpawnDepth } from './subagent-registry.helpers.js';

export interface RuntimeSpawnOptions {
  maxDepth?: number;
  maxChildren?: number;
  timeoutMs?: number;
  cleanupPolicy?: 'delete' | 'keep';
  sandboxMode?: 'inherit' | 'require';
  contextMode?: 'isolated' | 'fork';
}

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_CHILDREN = 10;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export async function spawnRuntimeSubagent(
  options: SpawnOptions,
  context: SpawnContext,
  runtimeOptions: RuntimeSpawnOptions = {},
): Promise<SpawnResult> {
  const maxDepth = runtimeOptions.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxChildren = runtimeOptions.maxChildren ?? DEFAULT_MAX_CHILDREN;
  const timeoutMs = runtimeOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const depth = getSpawnDepth(context.parentSessionKey ?? context.agentSessionKey ?? '');

  if (depth >= maxDepth) {
    return {
      status: 'forbidden',
      error: `Spawn depth exceeds maximum (${depth} >= ${maxDepth})`,
    };
  }

  const ownershipValidation = validateOwnership(options, context, maxDepth);
  if (!ownershipValidation.valid) {
    return {
      status: 'forbidden',
      error: ownershipValidation.errors.join(', '),
    };
  }

  const resolvedContext = resolveSpawnContext(context, options, {
    inheritTools: true,
    inheritWorkspace: true,
    inheritMembership: true,
    maxDepth,
  });

  const spawnOptions: SpawnOptions = {
    ...options,
    mode: options.mode ?? 'run',
    thread: options.thread ?? false,
    cleanup: runtimeOptions.cleanupPolicy ?? options.cleanup ?? 'keep',
    sandbox: runtimeOptions.sandboxMode ?? options.sandbox ?? 'inherit',
    context: runtimeOptions.contextMode ?? options.context ?? 'isolated',
    runTimeoutSeconds: timeoutMs / 1000,
  };

  const spawnContext: SpawnContext = {
    ...resolvedContext.inheritedContext,
    parentSessionKey: context.agentSessionKey ?? context.parentSessionKey,
  };

  const result = await spawnSubagent(spawnOptions, spawnContext);

  if (result.status === 'accepted' && options.attachments && context.workspaceDir) {
    const attachmentsResult = processAttachments(options, context.workspaceDir);
    if (attachmentsResult) {
      result.attachments = attachmentsResult;
    }
  }

  logger.debug(
    `[SubagentSpawn] Spawned runtime subagent at depth ${depth}, mode=${spawnOptions.mode}`,
  );

  return result;
}

export function calculateSpawnLimitRemaining(
  parentSessionKey: string,
  maxChildren: number = DEFAULT_MAX_CHILDREN,
): number {
  const registry = getSubagentRegistry();
  const instances = registry.listInstances({ parentSessionKey });
  const activeCount = instances.filter(
    (i) => i.status === 'running' || i.status === 'spawning' || i.status === 'paused',
  ).length;
  return maxChildren - activeCount;
}

export function isSpawnAllowed(
  options: SpawnOptions,
  context: SpawnContext,
  runtimeOptions: RuntimeSpawnOptions = {},
): { allowed: boolean; reason?: string } {
  const maxDepth = runtimeOptions.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxChildren = runtimeOptions.maxChildren ?? DEFAULT_MAX_CHILDREN;

  const depth = getSpawnDepth(context.parentSessionKey ?? context.agentSessionKey ?? '');
  if (depth >= maxDepth) {
    return { allowed: false, reason: `Depth ${depth} exceeds max ${maxDepth}` };
  }

  if (options.mode === 'session' && !options.thread) {
    return { allowed: false, reason: 'Session mode requires thread binding' };
  }

  if (context.parentSessionKey) {
    const remaining = calculateSpawnLimitRemaining(context.parentSessionKey, maxChildren);
    if (remaining <= 0) {
      return { allowed: false, reason: 'Max children limit exceeded' };
    }
  }

  return { allowed: true };
}

import { getSubagentRegistry } from '../subagentRegistry.js';