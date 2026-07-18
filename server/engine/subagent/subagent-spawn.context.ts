/**
 * Subagent Spawn Context — 上下文传递
 *
 * 处理子代理生成时的上下文继承和传递。
 */

import { logger } from '../../logger.js';
import type { SpawnContext, SpawnOptions } from './subagent-spawn.types.js';
import { inheritContextFromParent, getParentContext, buildInheritedContext } from './subagent-active-context.js';
import { getSpawnDepth } from './subagent-registry.helpers.js';

export interface ContextInheritanceResult {
  inheritedContext: SpawnContext;
  depth: number;
  warnings: string[];
}

export interface ContextTransferOptions {
  inheritTools?: boolean;
  inheritWorkspace?: boolean;
  inheritMembership?: boolean;
  lightContext?: boolean;
  maxDepth?: number;
}

const DEFAULT_MAX_CONTEXT_DEPTH = 5;

export function resolveSpawnContext(
  parentContext: SpawnContext,
  options: SpawnOptions,
  transferOptions: ContextTransferOptions = {},
): ContextInheritanceResult {
  const warnings: string[] = [];
  const maxDepth = transferOptions.maxDepth ?? DEFAULT_MAX_CONTEXT_DEPTH;

  const depth = getSpawnDepth(parentContext.parentSessionKey ?? parentContext.agentSessionKey ?? '');

  if (depth >= maxDepth) {
    warnings.push(`Context inheritance limited at depth ${depth} (max: ${maxDepth})`);
    return {
      inheritedContext: { ...parentContext },
      depth,
      warnings,
    };
  }

  const inheritedContext: SpawnContext = {
    agentSessionKey: parentContext.agentSessionKey,
    completionOwnerKey: parentContext.completionOwnerKey,
    agentChannel: parentContext.agentChannel,
    agentAccountId: parentContext.agentAccountId,
    agentTo: parentContext.agentTo,
    agentThreadId: parentContext.agentThreadId,
    agentGroupId: parentContext.agentGroupId,
    agentGroupChannel: parentContext.agentGroupChannel,
    agentGroupSpace: parentContext.agentGroupSpace,
    requesterAgentIdOverride: parentContext.requesterAgentIdOverride,
    workspaceDir: parentContext.workspaceDir,
    parentSessionKey: parentContext.agentSessionKey ?? parentContext.parentSessionKey,
  };

  if (transferOptions.inheritTools !== false && options.lightContext !== true) {
    inheritedContext.inheritedToolAllowlist = parentContext.inheritedToolAllowlist;
    inheritedContext.inheritedToolDenylist = parentContext.inheritedToolDenylist;
  }

  if (transferOptions.inheritMembership !== false) {
    inheritedContext.agentMemberRoleIds = parentContext.agentMemberRoleIds;
  }

  logger.debug(`[SubagentSpawnContext] Resolved context at depth ${depth}`);

  return {
    inheritedContext,
    depth,
    warnings,
  };
}

export function buildSpawnContext(
  baseContext: SpawnContext,
  options: SpawnOptions,
): SpawnContext {
  const context: SpawnContext = { ...baseContext };

  if (options.cwd && !baseContext.workspaceDir) {
    context.workspaceDir = options.cwd;
  }

  if (options.metadata) {
    if (!context.workspaceDir && options.metadata.workspaceDir) {
      context.workspaceDir = String(options.metadata.workspaceDir);
    }
  }

  return context;
}

export function validateContextTransfer(
  fromContext: SpawnContext,
  toContext: SpawnContext,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (fromContext.agentAccountId !== toContext.agentAccountId) {
    errors.push('Cannot transfer context across different accounts');
  }

  if (fromContext.agentGroupId && !toContext.agentGroupId) {
    errors.push('Group context not preserved in transfer');
  }

  return { valid: errors.length === 0, errors };
}

export function mergeContexts(
  base: SpawnContext,
  override: Partial<SpawnContext>,
): SpawnContext {
  const merged: SpawnContext = { ...base, ...override };

  if (base.inheritedToolAllowlist && override.inheritedToolAllowlist) {
    const allowlist = new Set([...base.inheritedToolAllowlist, ...override.inheritedToolAllowlist]);
    merged.inheritedToolAllowlist = Array.from(allowlist);
  }

  if (base.inheritedToolDenylist && override.inheritedToolDenylist) {
    const denylist = new Set([...base.inheritedToolDenylist, ...override.inheritedToolDenylist]);
    merged.inheritedToolDenylist = Array.from(denylist);
  }

  return merged;
}