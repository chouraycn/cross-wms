import { z } from 'zod';
import { logger } from '../../logger.js';

export const ToolPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  effect: z.enum(['allow', 'deny', 'require_approval']),
  toolPatterns: z.array(z.string()).default([]),
  agentPatterns: z.array(z.string()).default([]),
  conditions: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().default(0),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
});

export type ToolPolicy = z.infer<typeof ToolPolicySchema>;

const policyStore = new Map<string, ToolPolicy>();

export function registerToolPolicy(policy: Omit<ToolPolicy, 'description' | 'enabled'> & { description?: string; enabled?: boolean }): ToolPolicy {
  const fullPolicy: ToolPolicy = {
    ...policy,
    description: policy.description ?? '',
    enabled: policy.enabled ?? true,
  };

  const result = ToolPolicySchema.safeParse(fullPolicy);
  if (!result.success) {
    throw new Error(`Invalid tool policy: ${result.error.message}`);
  }

  policyStore.set(policy.id, result.data);
  logger.debug(`[Agents:ToolPolicy] Registered policy: ${policy.id}`);
  return result.data;
}

export function getToolPolicy(id: string): ToolPolicy | undefined {
  return policyStore.get(id);
}

export function listToolPolicies(): ToolPolicy[] {
  return Array.from(policyStore.values()).sort((a, b) => b.priority - a.priority);
}

export function updateToolPolicy(id: string, updates: Partial<ToolPolicy>): ToolPolicy | undefined {
  const existing = policyStore.get(id);
  if (!existing) return undefined;

  const updated: ToolPolicy = {
    ...existing,
    ...updates,
    id,
  };

  policyStore.set(id, updated);
  logger.debug(`[Agents:ToolPolicy] Updated policy: ${id}`);
  return updated;
}

export function deleteToolPolicy(id: string): boolean {
  const existed = policyStore.has(id);
  if (existed) {
    policyStore.delete(id);
    logger.debug(`[Agents:ToolPolicy] Deleted policy: ${id}`);
  }
  return existed;
}

export function enableToolPolicy(id: string): boolean {
  const policy = policyStore.get(id);
  if (!policy) return false;
  policy.enabled = true;
  return true;
}

export function disableToolPolicy(id: string): boolean {
  const policy = policyStore.get(id);
  if (!policy) return false;
  policy.enabled = false;
  return true;
}

export function clearToolPolicies(): void {
  policyStore.clear();
}

export function matchToolPattern(toolName: string, pattern: string): boolean {
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

export function matchAgentPattern(agentId: string, pattern: string): boolean {
  return matchToolPattern(agentId, pattern);
}

logger.debug('[Agents:ToolPolicy] Module loaded');

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const DEFAULT_PLUGIN_TOOLS_ALLOWLIST_ENTRY: string = undefined as unknown as string;
export const normalizeToolName: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
