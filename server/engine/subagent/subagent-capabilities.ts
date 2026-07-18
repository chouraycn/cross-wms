/**
 * Subagent Capabilities — 子代理能力声明
 *
 * 能力检测和匹配。
 */

import { z } from 'zod';
import { logger } from '../../logger.js';

export const SubagentCapabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  version: z.string().optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SubagentCapability = z.infer<typeof SubagentCapabilitySchema>;

export interface CapabilityMatchResult {
  capability: SubagentCapability;
  score: number;
  matchedTags: string[];
  matchedInputs: string[];
}

export interface CapabilityQuery {
  tags?: string[];
  inputs?: string[];
  outputs?: string[];
  category?: string;
  minScore?: number;
  limit?: number;
}

const capabilities = new Map<string, SubagentCapability>();
const capabilityTags = new Map<string, Set<string>>();
const capabilityCategories = new Map<string, Set<string>>();

export function registerCapability(capability: SubagentCapability): boolean {
  const result = SubagentCapabilitySchema.safeParse(capability);
  if (!result.success) {
    logger.error(
      '[SubagentCapabilities] Invalid capability:',
      result.error.message,
    );
    return false;
  }

  const valid = result.data;
  capabilities.set(valid.id, valid);

  if (valid.tags) {
    for (const tag of valid.tags) {
      if (!capabilityTags.has(tag)) {
        capabilityTags.set(tag, new Set());
      }
      capabilityTags.get(tag)!.add(valid.id);
    }
  }

  if (valid.category) {
    if (!capabilityCategories.has(valid.category)) {
      capabilityCategories.set(valid.category, new Set());
    }
    capabilityCategories.get(valid.category)!.add(valid.id);
  }

  logger.debug(`[SubagentCapabilities] Registered capability: ${valid.id}`);
  return true;
}

export function unregisterCapability(capabilityId: string): boolean {
  const capability = capabilities.get(capabilityId);
  if (!capability) return false;

  if (capability.tags) {
    for (const tag of capability.tags) {
      capabilityTags.get(tag)?.delete(capabilityId);
      if (capabilityTags.get(tag)?.size === 0) {
        capabilityTags.delete(tag);
      }
    }
  }

  if (capability.category) {
    capabilityCategories.get(capability.category)?.delete(capabilityId);
    if (capabilityCategories.get(capability.category)?.size === 0) {
      capabilityCategories.delete(capability.category);
    }
  }

  capabilities.delete(capabilityId);
  logger.debug(`[SubagentCapabilities] Unregistered capability: ${capabilityId}`);
  return true;
}

export function getCapability(capabilityId: string): SubagentCapability | undefined {
  return capabilities.get(capabilityId);
}

export function hasCapability(capabilityId: string): boolean {
  return capabilities.has(capabilityId);
}

export function listCapabilities(options?: {
  category?: string;
  tag?: string;
  enabledOnly?: boolean;
}): SubagentCapability[] {
  let result: SubagentCapability[];

  if (options?.category) {
    const ids = capabilityCategories.get(options.category);
    result = ids ? Array.from(ids).map((id) => capabilities.get(id)!).filter(Boolean) : [];
  } else if (options?.tag) {
    const ids = capabilityTags.get(options.tag);
    result = ids ? Array.from(ids).map((id) => capabilities.get(id)!).filter(Boolean) : [];
  } else {
    result = Array.from(capabilities.values());
  }

  if (options?.enabledOnly) {
    result = result.filter((c) => c.enabled !== false);
  }

  return result.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function matchCapabilities(query: CapabilityQuery): CapabilityMatchResult[] {
  const results: CapabilityMatchResult[] = [];

  for (const capability of capabilities.values()) {
    if (capability.enabled === false) continue;

    let score = 0;
    const matchedTags: string[] = [];
    const matchedInputs: string[] = [];

    if (query.category && capability.category === query.category) {
      score += 20;
    }

    if (query.tags && capability.tags) {
      for (const tag of query.tags) {
        if (capability.tags.includes(tag)) {
          matchedTags.push(tag);
          score += 10;
        }
      }
    }

    if (query.inputs && capability.inputs) {
      for (const input of query.inputs) {
        if (capability.inputs.includes(input)) {
          matchedInputs.push(input);
          score += 5;
        }
      }
    }

    if (query.outputs && capability.outputs) {
      for (const output of query.outputs) {
        if (capability.outputs.includes(output)) {
          score += 5;
        }
      }
    }

    if (capability.priority) {
      score += capability.priority;
    }

    if (query.minScore !== undefined && score < query.minScore) {
      continue;
    }

    if (score > 0) {
      results.push({
        capability,
        score,
        matchedTags,
        matchedInputs,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (query.limit && query.limit > 0) {
    return results.slice(0, query.limit);
  }

  return results;
}

export function findBestCapability(query: CapabilityQuery): SubagentCapability | undefined {
  const results = matchCapabilities({ ...query, limit: 1 });
  return results[0]?.capability;
}

export function getCapabilityTags(): string[] {
  return Array.from(capabilityTags.keys()).sort();
}

export function getCapabilityCategories(): string[] {
  return Array.from(capabilityCategories.keys()).sort();
}

export function getCapabilityStats(): {
  total: number;
  enabled: number;
  categories: number;
  tags: number;
} {
  let enabled = 0;
  for (const cap of capabilities.values()) {
    if (cap.enabled !== false) {
      enabled++;
    }
  }

  return {
    total: capabilities.size,
    enabled,
    categories: capabilityCategories.size,
    tags: capabilityTags.size,
  };
}

export function clearCapabilities(): void {
  capabilities.clear();
  capabilityTags.clear();
  capabilityCategories.clear();
  logger.debug('[SubagentCapabilities] Cleared all capabilities');
}

export function validateCapability(data: unknown): {
  success: boolean;
  capability?: SubagentCapability;
  error?: string;
} {
  const result = SubagentCapabilitySchema.safeParse(data);
  if (result.success) {
    return { success: true, capability: result.data };
  }
  return { success: false, error: result.error.message };
}

export function mergeCapabilities(
  base: SubagentCapability,
  overrides: Partial<SubagentCapability>,
): SubagentCapability {
  const merged: SubagentCapability = {
    ...base,
    ...overrides,
  };

  if (base.tags && overrides.tags) {
    const tagSet = new Set([...base.tags, ...overrides.tags]);
    merged.tags = Array.from(tagSet);
  }

  if (base.inputs && overrides.inputs) {
    const inputSet = new Set([...base.inputs, ...overrides.inputs]);
    merged.inputs = Array.from(inputSet);
  }

  if (base.outputs && overrides.outputs) {
    const outputSet = new Set([...base.outputs, ...overrides.outputs]);
    merged.outputs = Array.from(outputSet);
  }

  if (base.metadata && overrides.metadata) {
    merged.metadata = { ...base.metadata, ...overrides.metadata };
  }

  return merged;
}

export const standardCapabilities: SubagentCapability[] = [
  {
    id: 'code-analysis',
    name: '代码分析',
    description: '分析代码结构和质量',
    category: 'development',
    tags: ['code', 'analysis', 'review'],
    inputs: ['code', 'file-path'],
    outputs: ['analysis-report', 'issues'],
    priority: 10,
  },
  {
    id: 'code-generation',
    name: '代码生成',
    description: '根据需求生成代码',
    category: 'development',
    tags: ['code', 'generation', 'implementation'],
    inputs: ['requirements', 'specification'],
    outputs: ['code', 'implementation'],
    priority: 10,
  },
  {
    id: 'testing',
    name: '测试',
    description: '编写和运行测试',
    category: 'development',
    tags: ['testing', 'qa', 'validation'],
    inputs: ['code', 'test-cases'],
    outputs: ['test-results', 'test-code'],
    priority: 8,
  },
  {
    id: 'documentation',
    name: '文档',
    description: '生成和维护文档',
    category: 'documentation',
    tags: ['docs', 'documentation', 'writing'],
    inputs: ['code', 'specification'],
    outputs: ['documentation', 'markdown'],
    priority: 5,
  },
  {
    id: 'refactoring',
    name: '重构',
    description: '代码重构和优化',
    category: 'development',
    tags: ['refactoring', 'optimization', 'cleanup'],
    inputs: ['code', 'refactor-spec'],
    outputs: ['refactored-code'],
    priority: 7,
  },
  {
    id: 'debugging',
    name: '调试',
    description: '定位和修复问题',
    category: 'development',
    tags: ['debug', 'bug-fix', 'troubleshooting'],
    inputs: ['error', 'code', 'stack-trace'],
    outputs: ['fix', 'explanation'],
    priority: 9,
  },
  {
    id: 'research',
    name: '研究',
    description: '技术调研和信息收集',
    category: 'research',
    tags: ['research', 'analysis', 'information'],
    inputs: ['topic', 'question'],
    outputs: ['report', 'findings'],
    priority: 6,
  },
  {
    id: 'planning',
    name: '规划',
    description: '任务规划和分解',
    category: 'management',
    tags: ['planning', 'task-breakdown', 'estimation'],
    inputs: ['goal', 'requirements'],
    outputs: ['plan', 'tasks', 'estimates'],
    priority: 4,
  },
];

export function registerStandardCapabilities(): void {
  for (const cap of standardCapabilities) {
    registerCapability(cap);
  }
  logger.debug(`[SubagentCapabilities] Registered ${standardCapabilities.length} standard capabilities`);
}

export interface ResolvedSubagentCapabilities {
  role: string;
  controlScope: string;
  canSpawnSubagents: boolean;
  maxSpawnDepth: number;
  toolAccess: 'full' | 'restricted' | 'none';
  fileSystemAccess: 'full' | 'read-only' | 'none';
  networkAccess: boolean;
  memoryAccess: boolean;
}

export interface ResolveCapabilitiesOptions {
  depth: number;
  maxSpawnDepth: number;
  agentId?: string;
  parentCapabilities?: Partial<ResolvedSubagentCapabilities>;
}

export function resolveSubagentCapabilities(
  options: ResolveCapabilitiesOptions,
): ResolvedSubagentCapabilities {
  const { depth, maxSpawnDepth, parentCapabilities } = options;

  const canSpawnSubagents = depth < maxSpawnDepth;

  const baseCapabilities: ResolvedSubagentCapabilities = {
    role: 'subagent',
    controlScope: 'task',
    canSpawnSubagents,
    maxSpawnDepth,
    toolAccess: 'restricted',
    fileSystemAccess: 'read-only',
    networkAccess: false,
    memoryAccess: true,
  };

  if (parentCapabilities) {
    return {
      ...baseCapabilities,
      ...parentCapabilities,
      canSpawnSubagents,
      maxSpawnDepth,
    };
  }

  if (depth === 0) {
    return {
      role: 'coordinator',
      controlScope: 'session',
      canSpawnSubagents,
      maxSpawnDepth,
      toolAccess: 'full',
      fileSystemAccess: 'full',
      networkAccess: true,
      memoryAccess: true,
    };
  }

  if (depth === 1) {
    return {
      role: 'worker',
      controlScope: 'task',
      canSpawnSubagents,
      maxSpawnDepth,
      toolAccess: 'restricted',
      fileSystemAccess: 'full',
      networkAccess: true,
      memoryAccess: true,
    };
  }

  return baseCapabilities;
}
