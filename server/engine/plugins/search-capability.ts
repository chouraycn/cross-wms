/**
 * Search 能力提供者 — Web 搜索能力
 *
 * 插件可注册自定义搜索引擎（如 Brave、Exa、Tavily）。
 * 与 server/engine/plugins/web-search-providers.runtime.ts 互补：
 * - web-search-providers.runtime.ts 负责 OpenClaw 运行时集成
 * - 本文件提供 SDK 层的能力注册与调用接口
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError } from './plugin-errors.js';

/** 搜索结果项 */
export interface SearchResultItem {
  /** 标题 */
  title: string;
  /** URL */
  url: string;
  /** 摘要 */
  snippet?: string;
  /** 完整内容（如启用内容提取） */
  content?: string;
  /** 相关性分数（0-1） */
  score?: number;
  /** 发布时间 */
  publishedAt?: string;
  /** 来源 favicon */
  faviconUrl?: string;
  /** 图片缩略图 */
  thumbnailUrl?: string;
}

/** 搜索选项 */
export interface SearchInvokeOptions {
  /** 搜索查询 */
  query: string;
  /** 结果数量 */
  numResults?: number;
  /** 语言 */
  language?: string;
  /** 地区 */
  region?: string;
  /** 安全搜索 */
  safeSearch?: boolean;
  /** 时间范围 */
  timeRange?: 'day' | 'week' | 'month' | 'year';
  /** 是否提取页面内容 */
  extractContent?: boolean;
  /** 域名过滤（仅返回这些域名的结果） */
  includeDomains?: string[];
  /** 域名排除 */
  excludeDomains?: string[];
  /** 会话 ID */
  sessionId?: string;
}

/** 搜索结果 */
export interface SearchInvokeResult {
  /** 结果列表 */
  results: SearchResultItem[];
  /** 搜索查询 */
  query: string;
  /** 搜索耗时（毫秒） */
  tookMs?: number;
  /** 是否还有更多结果 */
  hasMore?: boolean;
  /** 搜索引擎返回的相关搜索建议 */
  relatedQueries?: string[];
  /** 错误信息 */
  error?: string;
}

/** 搜索能力提供者接口 */
export type SearchCapabilityProvider = CapabilityProvider<SearchInvokeOptions, SearchInvokeResult> & {
  /** 批量搜索 */
  batchSearch?(queries: string[], options?: Omit<SearchInvokeOptions, 'query'>): Promise<SearchInvokeResult[]>;
  /** 获取搜索建议 */
  suggest?(query: string): Promise<string[]>;
};

// ===================== 注册与调用 =====================

/** 注册 Search 能力提供者 */
export function registerSearchProvider(
  pluginId: string,
  provider: SearchCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 Search 能力提供者 */
export function unregisterSearchProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('search', providerId);
}

/** 执行搜索 */
export async function invokeSearch(
  providerId: string,
  options: SearchInvokeOptions,
): Promise<SearchInvokeResult> {
  const entry = capabilityProviderRegistry.find<SearchInvokeOptions, SearchInvokeResult>('search', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到搜索提供者: ${providerId}`, `search:${providerId}`);
  }

  try {
    return await entry.provider.invoke(options);
  } catch (err) {
    return {
      results: [],
      query: options.query,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 批量搜索 */
export async function batchSearch(
  providerId: string,
  queries: string[],
  options?: Omit<SearchInvokeOptions, 'query'>,
): Promise<SearchInvokeResult[]> {
  const entry = capabilityProviderRegistry.find<SearchInvokeOptions, SearchInvokeResult>('search', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到搜索提供者: ${providerId}`, `search:${providerId}`);
  }
  const provider = entry.provider as SearchCapabilityProvider;
  if (!provider.batchSearch) {
    // 降级：逐个搜索
    const results: SearchInvokeResult[] = [];
    for (const query of queries) {
      results.push(await provider.invoke({ ...options, query }));
    }
    return results;
  }
  return provider.batchSearch(queries, options);
}

/** 获取搜索建议 */
export async function getSearchSuggestions(providerId: string, query: string): Promise<string[]> {
  const entry = capabilityProviderRegistry.find<SearchInvokeOptions, SearchInvokeResult>('search', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到搜索提供者: ${providerId}`, `search:${providerId}`);
  }
  const provider = entry.provider as SearchCapabilityProvider;
  if (!provider.suggest) {
    return [];
  }
  return provider.suggest(query);
}

/** 列出所有 Search 提供者 */
export function listSearchProviders() {
  return capabilityProviderRegistry.list('search');
}

/** 创建 Search 能力提供者 */
export function createSearchProvider(
  id: string,
  invokeFn: (options: SearchInvokeOptions) => Promise<SearchInvokeResult>,
  options: {
    displayName?: string;
    description?: string;
    batchSearch?: (queries: string[], options?: Omit<SearchInvokeOptions, 'query'>) => Promise<SearchInvokeResult[]>;
    suggest?: (query: string) => Promise<string[]>;
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): SearchCapabilityProvider {
  const provider: SearchCapabilityProvider = {
    kind: 'search',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.batchSearch ? { batchSearch: options.batchSearch } : {}),
    ...(options.suggest ? { suggest: options.suggest } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}
