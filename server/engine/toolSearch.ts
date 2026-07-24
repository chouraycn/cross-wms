/**
 * Tool Search — 工具搜索与动态目录模块
 *
 * 功能特性：
 * - 智能工具搜索：按名称、描述、参数、标签多维度匹配
 * - 模糊匹配 + 关键词权重排序
 * - 工具分类（categories）和标签（tags）管理
 * - 动态工具目录：按场景/模式显示不同工具集
 * - 工具可见性控制：根据模型能力、用户权限、当前模式动态过滤
 * - 使用频率排序：常用工具优先
 * - 搜索缓存
 *
 * 集成思路：
 * 1. 在 toolRegistry 初始化后，构建工具搜索索引
 * 2. 每次生成 system prompt 时，根据当前模式筛选工具
 * 3. 支持动态隐藏/显示工具组
 */

import { logger } from '../logger.js';
import type { ToolDefinition } from '../aiClient.js';

// ==================== 类型定义 ====================

export interface SearchableTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  categories: string[];
  tags: string[];
  visibility: ToolVisibility;
  source: 'builtin' | 'plugin' | 'mcp' | 'skill';
  usageCount: number;
  lastUsedAt?: number;
}

export type ToolVisibility = 'always' | 'advanced_only' | 'expert_only' | 'hidden';

export type ToolMode = 'chat' | 'code' | 'research' | 'wms' | 'desktop' | 'admin';

export interface ToolSearchResult {
  tool: SearchableTool;
  score: number;
  matchReasons: string[];
}

export interface ToolSearchOptions {
  mode?: ToolMode;
  limit?: number;
  includeHidden?: boolean;
  categories?: string[];
  tags?: string[];
  minScore?: number;
}

export interface ToolCatalogConfig {
  modeTools: Record<ToolMode, string[]>;
  categoryTools: Record<string, string[]>;
  hiddenTools: string[];
  expertTools: string[];
  advancedTools: string[];
}

// ==================== 默认配置 ====================

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  system: ['system_info', 'app_set_bot_name'],
  file: ['list_dir', 'read_file', 'write_file', 'exec_command', 'file_search'],
  web: ['web_search', 'web_fetch', 'web_api_call'],
  database: ['db_query', 'wms_inventory'],
  desktop: [
    'desktop_screenshot', 'desktop_see', 'desktop_snapshot',
    'desktop_click', 'desktop_type', 'desktop_key_press', 'desktop_scroll',
    'desktop_click_smart', 'desktop_find',
    'desktop_app_launch', 'desktop_app_quit', 'desktop_window_focus',
    'desktop_clipboard', 'desktop_health',
  ],
  memory: ['memory_search', 'memory_add', 'memory_delete', 'memory_list'],
  planning: ['update_plan', 'get_plan'],
};

const MODE_DEFAULT_TOOLS: Record<ToolMode, string[]> = {
  chat: ['system_info', 'web_search', 'web_fetch'],
  code: ['system_info', 'list_dir', 'read_file', 'write_file', 'exec_command', 'web_search', 'web_fetch'],
  research: ['system_info', 'web_search', 'web_fetch', 'web_api_call', 'memory_search', 'memory_add'],
  wms: ['system_info', 'db_query', 'wms_inventory', 'web_search', 'web_fetch', 'memory_search', 'memory_add'],
  desktop: [
    'system_info', 'desktop_screenshot', 'desktop_see', 'desktop_snapshot',
    'desktop_click', 'desktop_type', 'desktop_key_press', 'desktop_scroll',
    'desktop_click_smart', 'desktop_find',
    'desktop_app_launch', 'desktop_app_quit', 'desktop_window_focus',
    'desktop_clipboard', 'desktop_health',
    'web_search', 'web_fetch',
  ],
  admin: ['system_info', 'list_dir', 'read_file', 'write_file', 'exec_command', 'db_query', 'web_search', 'web_fetch'],
};

// ==================== 工具函数 ====================

function extractKeywords(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, ' ');
  return cleaned
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 20);
}

function calculateScore(
  tool: SearchableTool,
  queryKeywords: string[],
  query: string
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const lowerQuery = query.toLowerCase();
  const lowerName = tool.name.toLowerCase();
  const lowerDesc = tool.description.toLowerCase();

  if (lowerName === lowerQuery) {
    score += 100;
    reasons.push('exact_name_match');
  } else if (lowerName.startsWith(lowerQuery)) {
    score += 70;
    reasons.push('name_prefix_match');
  } else if (lowerName.includes(lowerQuery)) {
    score += 50;
    reasons.push('name_contains');
  }

  if (lowerDesc.includes(lowerQuery)) {
    score += 30;
    reasons.push('description_contains');
  }

  for (const keyword of queryKeywords) {
    if (keyword.length < 2) continue;

    if (lowerName.includes(keyword)) {
      score += 15;
      reasons.push(`name_keyword:${keyword}`);
    }
    if (lowerDesc.includes(keyword)) {
      score += 8;
      reasons.push(`desc_keyword:${keyword}`);
    }
    for (const tag of tool.tags) {
      if (tag.toLowerCase().includes(keyword)) {
        score += 10;
        reasons.push(`tag_keyword:${keyword}`);
        break;
      }
    }
    for (const cat of tool.categories) {
      if (cat.toLowerCase().includes(keyword)) {
        score += 12;
        reasons.push(`category_keyword:${keyword}`);
        break;
      }
    }
  }

  if (tool.usageCount > 0) {
    const usageBoost = Math.min(tool.usageCount * 0.5, 10);
    score += usageBoost;
    reasons.push(`usage_boost:${usageBoost.toFixed(1)}`);
  }

  return { score, reasons: reasons.slice(0, 5) };
}

function categorizeTool(toolName: string): string[] {
  const categories: string[] = [];
  for (const [cat, tools] of Object.entries(DEFAULT_CATEGORIES)) {
    if (tools.includes(toolName)) {
      categories.push(cat);
    }
  }
  if (categories.length === 0) {
    if (toolName.includes('_')) {
      categories.push(toolName.split('_')[0]);
    } else {
      categories.push('other');
    }
  }
  return categories;
}

function generateTags(name: string, description: string): string[] {
  const tags: string[] = [];
  const lowerDesc = description.toLowerCase();

  if (/read|get|list|search|find|query|fetch|look/.test(lowerDesc)) tags.push('read');
  if (/write|create|update|modify|edit|save|set/.test(lowerDesc)) tags.push('write');
  if (/execute|run|command|shell|exec/.test(lowerDesc)) tags.push('execute');
  if (/web|http|url|internet|browser/.test(lowerDesc)) tags.push('web');
  if (/file|directory|folder|path/.test(lowerDesc)) tags.push('file');
  if (/system|info|status|health/.test(lowerDesc)) tags.push('system');
  if (/memory|remember|recall|search.*memory/.test(lowerDesc)) tags.push('memory');
  if (/desktop|gui|screen|click|type|keyboard|mouse/.test(lowerDesc)) tags.push('desktop');

  return tags;
}

// ==================== ToolSearchCatalog ====================

export class ToolSearchCatalog {
  private tools: Map<string, SearchableTool> = new Map();
  private searchCache: Map<string, ToolSearchResult[]> = new Map();
  private modeConfig: Record<ToolMode, string[]> = { ...MODE_DEFAULT_TOOLS };
  private customHidden: Set<string> = new Set();
  private customExpert: Set<string> = new Set();
  private customAdvanced: Set<string> = new Set();

  registerTool(
    definition: ToolDefinition,
    options?: {
      source?: SearchableTool['source'];
      categories?: string[];
      tags?: string[];
      visibility?: ToolVisibility;
    }
  ): void {
    const name = definition.function.name;
    const desc = definition.function.description || '';
    const params = (definition.function.parameters as Record<string, unknown>) || {};

    const categories = options?.categories || categorizeTool(name);
    const tags = options?.tags || generateTags(name, desc);

    const existing = this.tools.get(name);
    const usageCount = existing?.usageCount || 0;
    const lastUsedAt = existing?.lastUsedAt;

    this.tools.set(name, {
      name,
      description: desc,
      parameters: params,
      categories,
      tags,
      visibility: options?.visibility || 'always',
      source: options?.source || 'builtin',
      usageCount,
      lastUsedAt,
    });

    this.searchCache.clear();
    logger.debug(`[ToolSearch] 注册工具: ${name} (categories: ${categories.join(',')})`);
  }

  registerTools(
    definitions: ToolDefinition[],
    options?: Partial<{
      source: SearchableTool['source'];
      visibility: ToolVisibility;
    }>
  ): void {
    for (const def of definitions) {
      this.registerTool(def, options);
    }
  }

  unregisterTool(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      this.searchCache.clear();
      logger.debug(`[ToolSearch] 移除工具: ${name}`);
    }
    return existed;
  }

  getTool(name: string): SearchableTool | null {
    return this.tools.get(name) || null;
  }

  getAllTools(): SearchableTool[] {
    return Array.from(this.tools.values());
  }

  getToolsForMode(mode: ToolMode, includeAdvanced: boolean = false): ToolDefinition[] {
    const modeTools = this.modeConfig[mode];
    const results: ToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      if (tool.visibility === 'hidden') continue;
      if (tool.visibility === 'expert_only') continue;
      if (tool.visibility === 'advanced_only' && !includeAdvanced) continue;

      if (this.customHidden.has(tool.name)) continue;
      if (this.customExpert.has(tool.name)) continue;
      if (this.customAdvanced.has(tool.name) && !includeAdvanced) continue;

      if (modeTools && modeTools.length > 0) {
        if (!modeTools.includes(tool.name) && !modeTools.some((t) => tool.name.startsWith(t))) {
          continue;
        }
      }

      results.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      });
    }

    return results;
  }

  search(query: string, options: ToolSearchOptions = {}): ToolSearchResult[] {
    const cacheKey = `${query}:${options.mode || ''}:${options.limit || ''}:${options.includeHidden ? '1' : '0'}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const keywords = extractKeywords(query);
    const results: ToolSearchResult[] = [];
    const minScore = options.minScore ?? 5;

    for (const tool of this.tools.values()) {
      if (!options.includeHidden) {
        if (tool.visibility === 'hidden') continue;
        if (this.customHidden.has(tool.name)) continue;
      }

      if (options.mode) {
        const modeTools = this.modeConfig[options.mode];
        if (modeTools && modeTools.length > 0) {
          if (!modeTools.includes(tool.name) &&
              !modeTools.some((t) => tool.name.startsWith(t))) {
            continue;
          }
        }
      }

      if (options.categories && options.categories.length > 0) {
        if (!tool.categories.some((c) => options.categories!.includes(c))) {
          continue;
        }
      }

      if (options.tags && options.tags.length > 0) {
        if (!tool.tags.some((t) => options.tags!.includes(t))) {
          continue;
        }
      }

      const { score, reasons } = calculateScore(tool, keywords, query);

      if (score >= minScore) {
        results.push({ tool, score, matchReasons: reasons });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const finalResults = options.limit ? results.slice(0, options.limit) : results;
    this.searchCache.set(cacheKey, finalResults);

    logger.debug(
      `[ToolSearch] 搜索 "${query}": ${results.length} 个结果, ` +
      `top=${finalResults.length}, top1=${finalResults[0]?.tool.name || 'none'}`
    );

    return finalResults;
  }

  recordUsage(toolName: string): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.usageCount++;
      tool.lastUsedAt = Date.now();
      this.searchCache.clear();
    }
  }

  setModeTools(mode: ToolMode, toolNames: string[]): void {
    this.modeConfig[mode] = toolNames;
    this.searchCache.clear();
    logger.debug(`[ToolSearch] 模式 ${mode} 工具列表已更新: ${toolNames.length} 个`);
  }

  hideTool(toolName: string): void {
    this.customHidden.add(toolName);
    this.searchCache.clear();
  }

  showTool(toolName: string): void {
    this.customHidden.delete(toolName);
    this.searchCache.clear();
  }

  markAsExpert(toolName: string): void {
    this.customExpert.add(toolName);
    this.searchCache.clear();
  }

  markAsAdvanced(toolName: string): void {
    this.customAdvanced.add(toolName);
    this.searchCache.clear();
  }

  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    topUsed: Array<{ name: string; count: number }>;
  } {
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const allTools = Array.from(this.tools.values());

    for (const tool of allTools) {
      for (const cat of tool.categories) {
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      }
      bySource[tool.source] = (bySource[tool.source] || 0) + 1;
    }

    const topUsed = allTools
      .filter((t) => t.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map((t) => ({ name: t.name, count: t.usageCount }));

    return {
      total: this.tools.size,
      byCategory,
      bySource,
      topUsed,
    };
  }

  clearCache(): void {
    this.searchCache.clear();
  }

  reset(): void {
    this.tools.clear();
    this.searchCache.clear();
    this.customHidden.clear();
    this.customExpert.clear();
    this.customAdvanced.clear();
  }
}

// ==================== 单例 ====================

let defaultCatalog: ToolSearchCatalog | null = null;

export function getToolSearchCatalog(): ToolSearchCatalog {
  if (!defaultCatalog) {
    defaultCatalog = new ToolSearchCatalog();
  }
  return defaultCatalog;
}
