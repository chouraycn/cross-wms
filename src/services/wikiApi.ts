/**
 * Wiki 知识库 API 客户端
 * 封装 Wiki 相关的 HTTP 调用
 */

import { request } from './api';

// ===================== Types =====================

export interface WikiEntry {
  id: number;
  title: string;
  content: string;
  summary?: string;
  source: string;
  sourcePath?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  embedding?: number[];
}

export interface WikiStats {
  totalEntries: number;
  totalTags: number;
  sourceDistribution: Record<string, number>;
  tagDistribution: Record<string, number>;
  lastUpdated?: number;
}

export interface WikiSearchOptions {
  query: string;
  topK?: number;
  tags?: string[];
  source?: string;
  useVectorSearch?: boolean;
  useFtsSearch?: boolean;
}

export interface WikiSearchResult {
  id: number;
  title: string;
  summary?: string;
  content: string;
  score: number;
  tags: string[];
  source: string;
}

export interface WikiEntryCreateParams {
  title: string;
  content: string;
  summary?: string;
  source?: string;
  tags?: string[];
}

export interface WikiEntryUpdateParams {
  id?: number;
  title?: string;
  content?: string;
  summary?: string;
  tags?: string[];
}

export interface WikiVersion {
  version: number;
  title: string;
  content: string;
  summary?: string;
  updatedAt: number;
  changes?: string;
}

// ===================== API Functions =====================

/** 获取 Wiki 统计信息 */
export async function getWikiStats(): Promise<WikiStats> {
  const res = await request<{ stats: WikiStats }>('GET', '/api/wiki/stats');
  return res.stats;
}

/** 获取最近条目 */
export async function getRecentEntries(limit?: number): Promise<WikiEntry[]> {
  const query = limit ? `?limit=${limit}` : '';
  const res = await request<{ entries: WikiEntry[] }>('GET', `/api/wiki/recent${query}`);
  return res.entries;
}

/** 搜索知识库 */
export async function searchWiki(options: WikiSearchOptions): Promise<WikiSearchResult[]> {
  const res = await request<{ results: WikiSearchResult[] }>('POST', '/api/wiki/search', options);
  return res.results;
}

/** 获取条目详情 */
export async function getEntry(id: number): Promise<WikiEntry> {
  const res = await request<{ entry: WikiEntry }>('GET', `/api/wiki/entry/${id}`);
  return res.entry;
}

/** 创建条目 */
export async function createEntry(params: WikiEntryCreateParams): Promise<WikiEntry> {
  const res = await request<{ entry: WikiEntry }>('POST', '/api/wiki/entry', params);
  return res.entry;
}

/** 更新条目 */
export async function updateEntry(id: number, params: WikiEntryUpdateParams): Promise<WikiEntry> {
  const res = await request<{ entry: WikiEntry }>('PUT', `/api/wiki/entry/${id}`, params);
  return res.entry;
}

/** 删除条目 */
export async function deleteEntry(id: number): Promise<boolean> {
  const res = await request<{ success: boolean }>('DELETE', `/api/wiki/entry/${id}`);
  return res.success;
}

/** 获取条目标签 */
export async function getEntryTags(id: number): Promise<string[]> {
  const res = await request<{ tags: string[] }>('GET', `/api/wiki/entry/${id}/tags`);
  return res.tags;
}

/** 添加标签到条目 */
export async function addTagToEntry(id: number, tag: string): Promise<boolean> {
  const res = await request<{ success: boolean }>('POST', `/api/wiki/entry/${id}/tags`, { tag });
  return res.success;
}

/** 从条目移除标签 */
export async function removeTagFromEntry(id: number, tag: string): Promise<boolean> {
  const res = await request<{ success: boolean }>('DELETE', `/api/wiki/entry/${id}/tags/${encodeURIComponent(tag)}`);
  return res.success;
}

/** 获取条目版本历史 */
export async function getEntryVersions(id: number): Promise<WikiVersion[]> {
  const res = await request<{ versions: WikiVersion[] }>('GET', `/api/wiki/entry/${id}/versions`);
  return res.versions;
}

/** 获取所有标签 */
export async function getAllTags(): Promise<Record<string, number>> {
  const res = await request<{ tags: Record<string, number> }>('GET', '/api/wiki/tags');
  return res.tags;
}