import { logger } from '../../logger.js';
import type {
  MarketplaceEntry,
  MarketplaceRating,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
} from './types.js';

/**
 * 插件市场 — 搜索 / 安装 / 评分 / 下载
 *
 * 本模块不直接发起网络请求（让上层注入 fetchClient 便于测试与多端复用）。
 * 维护本地缓存以减少对外部 registry 的依赖。
 */

export interface MarketplaceClient {
  search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult>;
  fetchEntry(pluginId: string): Promise<MarketplaceEntry | undefined>;
  download(pluginId: string, version?: string): Promise<{ url: string; sizeBytes: number; sha256: string }>;
  submitRating(rating: MarketplaceRating): Promise<void>;
}

export type MarketplaceFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const DEFAULT_ENDPOINT = 'https://marketplace.local/api';

const localCache = new Map<string, MarketplaceEntry>();
const ratingCache = new Map<string, MarketplaceRating[]>();

/**
 * 创建一个 marketplace client。
 *
 * @param fetchClient 注入的网络客户端（默认使用全局 fetch）
 * @param endpoint registry 端点
 */
export function createMarketplaceClient(
  fetchClient?: MarketplaceFetch,
  endpoint: string = DEFAULT_ENDPOINT,
): MarketplaceClient {
  const doFetch: MarketplaceFetch =
    fetchClient ??
    (async (url, init) => {
      const response = await fetch(url, init as RequestInit);
      return {
        ok: response.ok,
        status: response.status,
        json: () => response.json(),
      };
    });

  return {
    async search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
      const url = new URL(`${endpoint}/search`);
      if (query.keyword) url.searchParams.set('q', query.keyword);
      if (query.category) url.searchParams.set('category', query.category);
      if (query.author) url.searchParams.set('author', query.author);
      url.searchParams.set('limit', String(query.limit ?? 20));
      url.searchParams.set('offset', String(query.offset ?? 0));
      if (query.sortBy) url.searchParams.set('sortBy', query.sortBy);
      if (query.order) url.searchParams.set('order', query.order);

      // 优先返回本地缓存
      if (localCache.size > 0) {
        const filtered = filterLocalCache(query);
        if (filtered.length > 0) {
          logger.debug(`[Plugins:Marketplace] search cache hit: ${filtered.length}`);
          return paginate(filtered, query);
        }
      }

      try {
        const response = await doFetch(url.toString(), { method: 'GET' });
        if (!response.ok) {
          return { entries: [], total: 0, hasMore: false };
        }
        const payload = (await response.json()) as { entries?: MarketplaceEntry[]; total?: number };
        const entries = payload.entries ?? [];
        for (const entry of entries) {
          localCache.set(entry.id, entry);
        }
        return {
          entries,
          total: payload.total ?? entries.length,
          hasMore: entries.length === (query.limit ?? 20),
        };
      } catch (e) {
        logger.warn(`[Plugins:Marketplace] search failed:`, e);
        return { entries: [], total: 0, hasMore: false };
      }
    },

    async fetchEntry(pluginId: string): Promise<MarketplaceEntry | undefined> {
      const cached = localCache.get(pluginId);
      if (cached) return cached;
      try {
        const response = await doFetch(`${endpoint}/plugins/${pluginId}`, { method: 'GET' });
        if (!response.ok) return undefined;
        const entry = (await response.json()) as MarketplaceEntry;
        localCache.set(pluginId, entry);
        return entry;
      } catch (e) {
        logger.warn(`[Plugins:Marketplace] fetchEntry ${pluginId} failed:`, e);
        return undefined;
      }
    },

    async download(pluginId, version) {
      const response = await doFetch(
        `${endpoint}/plugins/${pluginId}/download${version ? `?version=${version}` : ''}`,
        { method: 'GET' },
      );
      if (!response.ok) {
        throw new Error(`[Plugins:Marketplace] download failed for ${pluginId}: ${response.status}`);
      }
      const payload = (await response.json()) as { url: string; sizeBytes: number; sha256: string };
      return payload;
    },

    async submitRating(rating: MarketplaceRating): Promise<void> {
      const list = ratingCache.get(rating.pluginId) ?? [];
      list.push(rating);
      ratingCache.set(rating.pluginId, list);

      const entry = localCache.get(rating.pluginId);
      if (entry) {
        const totalScore = entry.rating * entry.ratingCount + rating.score;
        const newCount = entry.ratingCount + 1;
        entry.rating = totalScore / newCount;
        entry.ratingCount = newCount;
        localCache.set(rating.pluginId, entry);
      }

      try {
        await doFetch(`${endpoint}/plugins/${rating.pluginId}/ratings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(rating),
        });
      } catch (e) {
        logger.warn(`[Plugins:Marketplace] submitRating failed:`, e);
      }
    },
  };
}

function filterLocalCache(query: MarketplaceSearchQuery): MarketplaceEntry[] {
  let entries = Array.from(localCache.values());
  if (query.keyword) {
    const kw = query.keyword.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.name.toLowerCase().includes(kw) ||
        (e.displayName ?? '').toLowerCase().includes(kw) ||
        e.description.toLowerCase().includes(kw),
    );
  }
  if (query.category) {
    entries = entries.filter((e) => e.categories.includes(query.category!));
  }
  if (query.author) {
    entries = entries.filter((e) => e.author === query.author);
  }
  entries = sortEntries(entries, query.sortBy ?? 'downloads', query.order ?? 'desc');
  return entries;
}

function sortEntries(
  entries: MarketplaceEntry[],
  sortBy: NonNullable<MarketplaceSearchQuery['sortBy']>,
  order: NonNullable<MarketplaceSearchQuery['order']>,
): MarketplaceEntry[] {
  const sorted = [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'downloads':
        cmp = a.downloads - b.downloads;
        break;
      case 'rating':
        cmp = a.rating - b.rating;
        break;
      case 'updatedAt':
        cmp = a.updatedAt - b.updatedAt;
        break;
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
    }
    return order === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function paginate(entries: MarketplaceEntry[], query: MarketplaceSearchQuery): MarketplaceSearchResult {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  const slice = entries.slice(offset, offset + limit);
  return {
    entries: slice,
    total: entries.length,
    hasMore: offset + limit < entries.length,
  };
}

// ===================== 测试辅助：注入缓存 =====================

export function seedMarketplaceCache(entries: MarketplaceEntry[]): void {
  for (const entry of entries) {
    localCache.set(entry.id, entry);
  }
}

export function clearMarketplaceCache(): void {
  localCache.clear();
  ratingCache.clear();
}

export function getMarketplaceCacheSize(): number {
  return localCache.size;
}
