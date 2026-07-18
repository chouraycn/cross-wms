import { z } from 'zod';
import { logger } from '../../logger.js';

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  category: z.string().default('general'),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  deprecated: z.boolean().default(false),
  version: z.string().default('1.0.0'),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

const catalogStore = new Map<string, ToolDefinition>();
const categoryIndex = new Map<string, Set<string>>();
const tagIndex = new Map<string, Set<string>>();

export function registerTool(tool: ToolDefinition): void {
  const result = ToolDefinitionSchema.safeParse(tool);
  if (!result.success) {
    logger.error(`[Agents:ToolCatalog] Invalid tool definition ${tool.name}: ${result.error.message}`);
    throw new Error(`Invalid tool definition: ${result.error.message}`);
  }

  catalogStore.set(tool.name, result.data);

  if (!categoryIndex.has(tool.category)) {
    categoryIndex.set(tool.category, new Set());
  }
  categoryIndex.get(tool.category)!.add(tool.name);

  for (const tag of tool.tags) {
    if (!tagIndex.has(tag)) {
      tagIndex.set(tag, new Set());
    }
    tagIndex.get(tag)!.add(tool.name);
  }

  logger.debug(`[Agents:ToolCatalog] Registered tool: ${tool.name}`);
}

export function unregisterTool(name: string): boolean {
  const tool = catalogStore.get(name);
  if (!tool) return false;

  catalogStore.delete(name);

  const catSet = categoryIndex.get(tool.category);
  if (catSet) {
    catSet.delete(name);
    if (catSet.size === 0) {
      categoryIndex.delete(tool.category);
    }
  }

  for (const tag of tool.tags) {
    const tagSet = tagIndex.get(tag);
    if (tagSet) {
      tagSet.delete(name);
      if (tagSet.size === 0) {
        tagIndex.delete(tag);
      }
    }
  }

  logger.debug(`[Agents:ToolCatalog] Unregistered tool: ${name}`);
  return true;
}

export function getTool(name: string): ToolDefinition | undefined {
  return catalogStore.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(catalogStore.values());
}

export function listToolNames(): string[] {
  return Array.from(catalogStore.keys());
}

export function getToolsByCategory(category: string): ToolDefinition[] {
  const names = categoryIndex.get(category);
  if (!names) return [];
  return Array.from(names).map(n => catalogStore.get(n)!).filter(Boolean);
}

export function getToolsByTag(tag: string): ToolDefinition[] {
  const names = tagIndex.get(tag);
  if (!names) return [];
  return Array.from(names).map(n => catalogStore.get(n)!).filter(Boolean);
}

export function listCategories(): string[] {
  return Array.from(categoryIndex.keys());
}

export function listTags(): string[] {
  return Array.from(tagIndex.keys());
}

export function toolExists(name: string): boolean {
  return catalogStore.has(name);
}

export function clearToolCatalog(): void {
  catalogStore.clear();
  categoryIndex.clear();
  tagIndex.clear();
}

export function registerTools(tools: ToolDefinition[]): void {
  for (const tool of tools) {
    registerTool(tool);
  }
}

logger.debug('[Agents:ToolCatalog] Module loaded');
