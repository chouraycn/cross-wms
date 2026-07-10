import { request } from './api';

export interface CacheStats {
  totalCaches: number;
  totalEntries: number;
  totalMemory: number;
  totalMemoryFormatted: string;
  overallHitRate: number;
  overallHitRatePercent: string;
  namespaces: Record<string, {
    entries: number;
    memory: number;
    hitRate: number;
  }>;
}

export interface NamespacesResponse {
  active: string[];
  predefined: string[];
  count: number;
}

export interface NamespaceInfo {
  name: string;
  stats: {
    totalEntries: number;
    hits: number;
    misses: number;
    hitRate: number;
    hitRatePercent: string;
    memoryEstimate: number;
    memoryEstimateFormatted: string;
  };
  options: {
    ttl?: number;
    maxSize?: number;
    maxEntries?: number;
  };
}

export interface NamespaceKeysResponse {
  namespace: string;
  total: number;
  returned: number;
  limit: number;
  offset: number;
  keys: string[];
}

export interface CacheEntry {
  key: string;
  value: unknown;
  createdAt: number;
  expiresAt: number;
  ttlRemaining: number;
  accessCount: number;
  lastAccessedAt: number;
  size: number;
  sizeFormatted: string;
}

export interface ClearResponse {
  clearedEntries: number;
  message: string;
}

export interface PruneResponse {
  removedEntries: number;
  message: string;
}

export interface DeleteResponse {
  namespace?: string;
  key?: string;
  message: string;
}

export async function getCacheStats(): Promise<CacheStats> {
  return request<CacheStats>('GET', '/api/cache/stats');
}

export async function getCacheNamespaces(): Promise<NamespacesResponse> {
  return request<NamespacesResponse>('GET', '/api/cache/namespaces');
}

export async function getNamespaceInfo(name: string): Promise<NamespaceInfo> {
  return request<NamespaceInfo>('GET', `/api/cache/namespaces/${encodeURIComponent(name)}`);
}

export async function clearAllCache(): Promise<ClearResponse> {
  return request<ClearResponse>('POST', '/api/cache/clear');
}

export async function clearNamespaceCache(name: string): Promise<ClearResponse> {
  return request<ClearResponse>('POST', `/api/cache/namespaces/${encodeURIComponent(name)}/clear`);
}

export async function deleteNamespace(name: string): Promise<DeleteResponse> {
  return request<DeleteResponse>('DELETE', `/api/cache/namespaces/${encodeURIComponent(name)}`);
}

export async function pruneExpired(): Promise<PruneResponse> {
  return request<PruneResponse>('POST', '/api/cache/prune');
}

export async function resetStats(): Promise<{ message: string }> {
  return request<{ message: string }>('POST', '/api/cache/stats/reset');
}

export async function getNamespaceKeys(name: string, limit = 100, offset = 0): Promise<NamespaceKeysResponse> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request<NamespaceKeysResponse>('GET', `/api/cache/namespaces/${encodeURIComponent(name)}/keys?${query}`);
}

export async function getCacheEntry(name: string, key: string): Promise<CacheEntry> {
  return request<CacheEntry>('GET', `/api/cache/namespaces/${encodeURIComponent(name)}/keys/${encodeURIComponent(key)}`);
}

export async function deleteCacheEntry(name: string, key: string): Promise<DeleteResponse> {
  return request<DeleteResponse>('DELETE', `/api/cache/namespaces/${encodeURIComponent(name)}/keys/${encodeURIComponent(key)}`);
}