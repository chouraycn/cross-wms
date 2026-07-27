import { z } from 'zod';
import { logger } from '../../logger.js';
import { sanitizeServerName, TOOL_NAME_SEPARATOR } from "./agent-bundle-mcp-names.js";
import {
  expandToolGroups,
  normalizeToolList,
  normalizeToolName,
  resolveToolProfilePolicy,
  TOOL_GROUPS,
} from "./tool-policy-shared.js";
export {
  couldNormalizeToolNamePrefixToAllowedTool,
  expandToolGroups,
  normalizeToolList,
  normalizeToolName,
  resolveToolProfilePolicy,
  TOOL_GROUPS,
} from "./tool-policy-shared.js";
export type { ToolProfileId } from "./tool-policy-shared.js";

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

export type ToolPolicyLike = {
  allow?: string[];
  deny?: string[];
};

export type PluginToolGroups = {
  all: string[];
  byPlugin: Map<string, string[]>;
};

export type DeclaredToolAllowlistContext = {
  pluginToolNames?: Iterable<string>;
  pluginIds?: Iterable<string>;
  mcpServerNames?: Iterable<string>;
};

export const DEFAULT_PLUGIN_TOOLS_ALLOWLIST_ENTRY = "__openclaw_default_plugin_tools__";

function normalizeOptionalLowercaseString(value?: string): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase().trim();
}

function uniqueStrings(list: string[]): string[] {
  return Array.from(new Set(list));
}

export function hasRestrictiveAllowPolicy(policy?: { allow?: string[] }): boolean {
  return (
    Array.isArray(policy?.allow) &&
    policy.allow.some((entry) => {
      const normalized = normalizeToolName(entry);
      return (
        Boolean(normalized) &&
        normalized !== "*" &&
        normalized !== DEFAULT_PLUGIN_TOOLS_ALLOWLIST_ENTRY
      );
    })
  );
}

export function replaceWithEffectiveToolAllowlist(
  target: string[],
  tools: Array<{ name: string }>,
): void {
  target.length = 0;
  const seen = new Set<string>();
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const normalized = normalizeToolName(tool.name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    target.push(normalized);
  }
}

export function collectExplicitAllowlist(policies: Array<ToolPolicyLike | undefined>): string[] {
  const entries: string[] = [];
  for (let i = 0; i < policies.length; i++) {
    const policy = policies[i];
    if (!policy?.allow) {
      continue;
    }
    for (let j = 0; j < policy.allow.length; j++) {
      const value = policy.allow[j];
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        entries.push(trimmed);
      }
    }
  }
  return uniqueStrings(entries);
}

export function collectExplicitDenylist(policies: Array<ToolPolicyLike | undefined>): string[] {
  const entries: string[] = [];
  for (let i = 0; i < policies.length; i++) {
    const policy = policies[i];
    if (!policy?.deny) {
      continue;
    }
    for (let j = 0; j < policy.deny.length; j++) {
      const value = policy.deny[j];
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        entries.push(trimmed);
      }
    }
  }
  return entries;
}

export function buildPluginToolGroups<T extends { name: string }>(params: {
  tools: T[];
  toolMeta: (tool: T) => { pluginId: string } | undefined;
}): PluginToolGroups {
  const all: string[] = [];
  const byPlugin = new Map<string, string[]>();
  for (let i = 0; i < params.tools.length; i++) {
    const tool = params.tools[i];
    const meta = params.toolMeta(tool);
    if (!meta) {
      continue;
    }
    const name = normalizeToolName(tool.name);
    all.push(name);
    const pluginId = normalizeOptionalLowercaseString(meta.pluginId);
    if (!pluginId) {
      continue;
    }
    const list = byPlugin.get(pluginId) ?? [];
    list.push(name);
    byPlugin.set(pluginId, list);
  }
  return { all, byPlugin };
}

function expandPluginGroups(
  list: string[] | undefined,
  groups: PluginToolGroups,
): string[] | undefined {
  if (!list || list.length === 0) {
    return list;
  }
  const expanded: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const normalized = normalizeToolName(entry);
    if (normalized === "group:plugins") {
      if (groups.all.length > 0) {
        expanded.push(...groups.all);
      } else {
        expanded.push(normalized);
      }
      continue;
    }
    const tools = groups.byPlugin.get(normalized);
    if (tools && tools.length > 0) {
      expanded.push(...tools);
      continue;
    }
    expanded.push(normalized);
  }
  return uniqueStrings(expanded);
}

export function expandPolicyWithPluginGroups(
  policy: ToolPolicyLike | undefined,
  groups: PluginToolGroups,
): ToolPolicyLike | undefined {
  if (!policy) {
    return undefined;
  }
  return {
    allow: expandPluginGroups(policy.allow, groups),
    deny: expandPluginGroups(policy.deny, groups),
  };
}

logger.debug('[Agents:ToolPolicy] Module loaded');
