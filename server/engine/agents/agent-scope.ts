import { z } from 'zod';
import { logger } from '../../logger.js';

export const AgentScopeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['global', 'project', 'session', 'agent', 'user']),
  parentScopeId: z.string().optional(),
  allowedTools: z.array(z.string()).default([]),
  deniedTools: z.array(z.string()).default([]),
  allowedPaths: z.array(z.string()).default([]),
  deniedPaths: z.array(z.string()).default([]),
  maxTokens: z.number().optional(),
  maxDurationMs: z.number().optional(),
  maxToolCalls: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type AgentScope = z.infer<typeof AgentScopeSchema>;

const scopeStore = new Map<string, AgentScope>();

export function createScope(params: {
  id: string;
  name: string;
  type: AgentScope['type'];
  parentScopeId?: string;
  allowedTools?: string[];
  deniedTools?: string[];
  allowedPaths?: string[];
  deniedPaths?: string[];
  maxTokens?: number;
  maxDurationMs?: number;
  maxToolCalls?: number;
  metadata?: Record<string, unknown>;
}): AgentScope {
  const now = Date.now();
  const scope: AgentScope = {
    id: params.id,
    name: params.name,
    type: params.type,
    parentScopeId: params.parentScopeId,
    allowedTools: params.allowedTools ?? [],
    deniedTools: params.deniedTools ?? [],
    allowedPaths: params.allowedPaths ?? [],
    deniedPaths: params.deniedPaths ?? [],
    maxTokens: params.maxTokens,
    maxDurationMs: params.maxDurationMs,
    maxToolCalls: params.maxToolCalls,
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  const result = AgentScopeSchema.safeParse(scope);
  if (!result.success) {
    throw new Error(`Invalid agent scope: ${result.error.message}`);
  }

  scopeStore.set(params.id, result.data);
  logger.debug(`[Agents:Scope] Created scope: ${params.id} (${params.type})`);
  return result.data;
}

export function getScope(scopeId: string): AgentScope | undefined {
  return scopeStore.get(scopeId);
}

export function updateScope(scopeId: string, updates: Partial<AgentScope>): AgentScope | undefined {
  const existing = scopeStore.get(scopeId);
  if (!existing) return undefined;

  const updated: AgentScope = {
    ...existing,
    ...updates,
    id: scopeId,
    updatedAt: Date.now(),
  };

  scopeStore.set(scopeId, updated);
  logger.debug(`[Agents:Scope] Updated scope: ${scopeId}`);
  return updated;
}

export function deleteScope(scopeId: string): boolean {
  const existed = scopeStore.has(scopeId);
  if (existed) {
    scopeStore.delete(scopeId);
    logger.debug(`[Agents:Scope] Deleted scope: ${scopeId}`);
  }
  return existed;
}

export function listScopes(): AgentScope[] {
  return Array.from(scopeStore.values());
}

export function getChildScopes(parentScopeId: string): AgentScope[] {
  return listScopes().filter(s => s.parentScopeId === parentScopeId);
}

export function getScopeHierarchy(scopeId: string): AgentScope[] {
  const hierarchy: AgentScope[] = [];
  let current = getScope(scopeId);
  
  while (current) {
    hierarchy.unshift(current);
    current = current.parentScopeId ? getScope(current.parentScopeId) : undefined;
  }
  
  return hierarchy;
}

export function isToolAllowedInScope(scopeId: string, toolName: string): boolean {
  const hierarchy = getScopeHierarchy(scopeId);
  
  for (const scope of hierarchy) {
    if (scope.deniedTools.some(p => matchToolPattern(toolName, p))) {
      return false;
    }
  }

  for (const scope of hierarchy) {
    if (scope.allowedTools.length > 0) {
      if (scope.allowedTools.some(p => matchToolPattern(toolName, p))) {
        return true;
      }
    }
  }

  return true;
}

export function isPathAllowedInScope(scopeId: string, path: string): boolean {
  const hierarchy = getScopeHierarchy(scopeId);
  
  for (const scope of hierarchy) {
    if (scope.deniedPaths.some(p => path.startsWith(p))) {
      return false;
    }
  }

  for (const scope of hierarchy) {
    if (scope.allowedPaths.length > 0) {
      if (scope.allowedPaths.some(p => path.startsWith(p))) {
        return true;
      }
    }
  }

  return true;
}

function matchToolPattern(toolName: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === toolName) return true;

  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  
  try {
    return new RegExp(`^${regexStr}$`).test(toolName);
  } catch {
    return false;
  }
}

export function clearScopes(): void {
  scopeStore.clear();
}

logger.debug('[Agents:AgentScope] Module loaded');

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const resolveAgentWorkspaceDir: any = undefined as any;
export const resolveDefaultAgentId: any = undefined as any;
