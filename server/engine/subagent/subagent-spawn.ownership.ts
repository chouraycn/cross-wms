/**
 * Subagent Spawn Ownership — 所有权管理
 *
 * 管理子代理的所有权和权限继承。
 */

import { logger } from '../../logger.js';
import type { SpawnContext, SpawnOptions } from './subagent-spawn.types.js';
import { getSpawnDepth } from './subagent-registry.helpers.js';

export interface OwnershipInfo {
  ownerSessionKey: string;
  ownerAccountId?: string;
  ownerChannel?: string;
  ownerThreadId?: string | number;
  depth: number;
  ownershipChain: string[];
}

export interface OwnershipValidationResult {
  valid: boolean;
  ownership: OwnershipInfo;
  errors: string[];
}

export function resolveOwnership(
  options: SpawnOptions,
  context: SpawnContext,
): OwnershipInfo {
  const depth = getSpawnDepth(context.parentSessionKey ?? context.agentSessionKey ?? '');

  const ownershipChain: string[] = [];
  if (context.parentSessionKey) {
    ownershipChain.push(context.parentSessionKey);
  }
  if (context.agentSessionKey && context.agentSessionKey !== context.parentSessionKey) {
    ownershipChain.push(context.agentSessionKey);
  }

  return {
    ownerSessionKey: context.agentSessionKey ?? context.parentSessionKey ?? '',
    ownerAccountId: context.agentAccountId,
    ownerChannel: context.agentChannel,
    ownerThreadId: context.agentThreadId,
    depth,
    ownershipChain,
  };
}

export function validateOwnership(
  options: SpawnOptions,
  context: SpawnContext,
  maxDepth: number = 5,
): OwnershipValidationResult {
  const errors: string[] = [];
  const ownership = resolveOwnership(options, context);

  if (!ownership.ownerSessionKey) {
    errors.push('Owner session key is required');
  }

  if (ownership.depth >= maxDepth) {
    errors.push(`Ownership depth exceeds maximum (${ownership.depth} >= ${maxDepth})`);
  }

  if (context.agentAccountId && options.metadata?.accountId) {
    if (String(options.metadata.accountId) !== context.agentAccountId) {
      errors.push('Cannot spawn subagent for different account');
    }
  }

  if (context.agentGroupId && options.metadata?.groupId) {
    if (String(options.metadata.groupId) !== String(context.agentGroupId)) {
      errors.push('Cannot spawn subagent for different group');
    }
  }

  logger.debug(`[SubagentSpawn] Validated ownership at depth ${ownership.depth}`);

  return {
    valid: errors.length === 0,
    ownership,
    errors,
  };
}

export function inheritOwnership(
  parentContext: SpawnContext,
): Partial<SpawnContext> {
  return {
    agentAccountId: parentContext.agentAccountId,
    agentChannel: parentContext.agentChannel,
    agentTo: parentContext.agentTo,
    agentThreadId: parentContext.agentThreadId,
    agentGroupId: parentContext.agentGroupId,
    agentGroupChannel: parentContext.agentGroupChannel,
    agentGroupSpace: parentContext.agentGroupSpace,
    agentMemberRoleIds: parentContext.agentMemberRoleIds,
    completionOwnerKey: parentContext.completionOwnerKey,
    requesterAgentIdOverride: parentContext.requesterAgentIdOverride,
  };
}

export function checkOwnerPermissions(
  ownership: OwnershipInfo,
  requiredPermissions: string[],
): { allowed: boolean; missingPermissions: string[] } {
  const missingPermissions: string[] = [];

  for (const permission of requiredPermissions) {
    if (!hasPermission(ownership, permission)) {
      missingPermissions.push(permission);
    }
  }

  return {
    allowed: missingPermissions.length === 0,
    missingPermissions,
  };
}

function hasPermission(ownership: OwnershipInfo, permission: string): boolean {
  if (ownership.depth === 0) {
    return true;
  }

  const permissionsByDepth: Record<number, string[]> = {
    1: ['spawn', 'read', 'write', 'execute'],
    2: ['spawn', 'read', 'execute'],
    3: ['read', 'execute'],
    4: ['execute'],
  };

  const allowed = permissionsByDepth[ownership.depth] ?? [];
  return allowed.includes(permission);
}