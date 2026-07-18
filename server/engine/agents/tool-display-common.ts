import { z } from 'zod';
import { logger } from '../../logger.js';

export const ToolDisplayConfigSchema = z.object({
  showIcon: z.boolean().default(true),
  showDescription: z.boolean().default(true),
  showParameters: z.boolean().default(true),
  maxDescriptionLength: z.number().default(200),
  compactMode: z.boolean().default(false),
  groupByCategory: z.boolean().default(true),
  sortBy: z.enum(['name', 'category', 'usage']).default('name'),
});

export type ToolDisplayConfig = z.infer<typeof ToolDisplayConfigSchema>;

export const DEFAULT_DISPLAY_CONFIG: ToolDisplayConfig = {
  showIcon: true,
  showDescription: true,
  showParameters: true,
  maxDescriptionLength: 200,
  compactMode: false,
  groupByCategory: true,
  sortBy: 'name',
};

export function truncateDescription(description: string, maxLength: number = 200): string {
  if (description.length <= maxLength) return description;
  return description.slice(0, maxLength - 3) + '...';
}

export function formatToolName(name: string): string {
  return name
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function getToolCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    file: '📁',
    code: '💻',
    search: '🔍',
    network: '🌐',
    system: '⚙️',
    database: '🗄️',
    general: '🔧',
    memory: '🧠',
    agent: '🤖',
  };
  return icons[category] ?? '🔧';
}

export function sortTools(tools: Array<{ name: string; category?: string }>, sortBy: ToolDisplayConfig['sortBy']): typeof tools {
  const sorted = [...tools];
  switch (sortBy) {
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'category':
      sorted.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''));
      break;
    case 'usage':
      break;
    default:
      break;
  }
  return sorted;
}

export function groupToolsByCategory<T extends { category?: string }>(tools: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const tool of tools) {
    const cat = tool.category ?? 'general';
    if (!groups[cat]) {
      groups[cat] = [];
    }
    groups[cat].push(tool);
  }
  return groups;
}

export function createToolDisplayConfig(overrides?: Partial<ToolDisplayConfig>): ToolDisplayConfig {
  return {
    ...DEFAULT_DISPLAY_CONFIG,
    ...overrides,
  };
}

export function filterToolsByQuery(
  tools: Array<{ name: string; description?: string; tags?: string[] }>,
  query: string,
): typeof tools {
  if (!query.trim()) return tools;
  
  const lowerQuery = query.toLowerCase();
  return tools.filter(tool => {
    if (tool.name.toLowerCase().includes(lowerQuery)) return true;
    if (tool.description?.toLowerCase().includes(lowerQuery)) return true;
    if (tool.tags?.some(t => t.toLowerCase().includes(lowerQuery))) return true;
    return false;
  });
}

logger.debug('[Agents:ToolDisplayCommon] Module loaded');
