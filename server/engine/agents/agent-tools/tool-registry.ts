import { z } from 'zod';
import { logger } from '../../../logger.js';
import type { ToolDefinition } from './types.js';
import { ToolDefinitionSchema } from './types.js';

export interface ToolImplementation {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const toolStore = new Map<string, ToolImplementation>();
const categoryIndex = new Map<string, Set<string>>();
const tagIndex = new Map<string, Set<string>>();

export function registerTool(implementation: ToolImplementation): void {
  const result = ToolDefinitionSchema.safeParse(implementation.definition);
  if (!result.success) {
    throw new Error(`Invalid tool definition ${implementation.definition.name}: ${result.error.message}`);
  }

  toolStore.set(implementation.definition.name, {
    ...implementation,
    definition: result.data,
  });

  const cat = result.data.category;
  if (!categoryIndex.has(cat)) {
    categoryIndex.set(cat, new Set());
  }
  categoryIndex.get(cat)!.add(result.data.name);

  for (const tag of result.data.tags) {
    if (!tagIndex.has(tag)) {
      tagIndex.set(tag, new Set());
    }
    tagIndex.get(tag)!.add(result.data.name);
  }

  logger.debug(`[Agents:ToolRegistry] Registered tool: ${result.data.name}`);
}

export function unregisterTool(name: string): boolean {
  const implementation = toolStore.get(name);
  if (!implementation) return false;

  toolStore.delete(name);

  const cat = implementation.definition.category;
  const catSet = categoryIndex.get(cat);
  if (catSet) {
    catSet.delete(name);
    if (catSet.size === 0) {
      categoryIndex.delete(cat);
    }
  }

  for (const tag of implementation.definition.tags) {
    const tagSet = tagIndex.get(tag);
    if (tagSet) {
      tagSet.delete(name);
      if (tagSet.size === 0) {
        tagIndex.delete(tag);
      }
    }
  }

  logger.debug(`[Agents:ToolRegistry] Unregistered tool: ${name}`);
  return true;
}

export function getTool(name: string): ToolImplementation | undefined {
  return toolStore.get(name);
}

export function listTools(options?: {
  category?: string;
  tags?: string[];
  excludeDeprecated?: boolean;
}): ToolImplementation[] {
  let tools = Array.from(toolStore.values());

  if (options?.excludeDeprecated) {
    tools = tools.filter(t => !t.definition.deprecated);
  }

  if (options?.category) {
    tools = tools.filter(t => t.definition.category === options.category);
  }

  if (options?.tags && options.tags.length > 0) {
    tools = tools.filter(t => options!.tags!.some(tag => t.definition.tags.includes(tag)));
  }

  return tools;
}

export function listToolNames(): string[] {
  return Array.from(toolStore.keys());
}

export function getToolsByCategory(category: string): ToolImplementation[] {
  const names = categoryIndex.get(category);
  if (!names) return [];
  return Array.from(names).map(n => toolStore.get(n)!).filter(Boolean);
}

export function getToolsByTag(tag: string): ToolImplementation[] {
  const names = tagIndex.get(tag);
  if (!names) return [];
  return Array.from(names).map(n => toolStore.get(n)!).filter(Boolean);
}

export function listCategories(): string[] {
  return Array.from(categoryIndex.keys());
}

export function listTags(): string[] {
  return Array.from(tagIndex.keys());
}

export function toolExists(name: string): boolean {
  return toolStore.has(name);
}

export function clearToolRegistry(): void {
  toolStore.clear();
  categoryIndex.clear();
  tagIndex.clear();
  logger.debug('[Agents:ToolRegistry] Cleared all tools');
}

export function registerTools(implementations: ToolImplementation[]): void {
  for (const impl of implementations) {
    registerTool(impl);
  }
}

logger.debug('[Agents:ToolRegistry] Module loaded');