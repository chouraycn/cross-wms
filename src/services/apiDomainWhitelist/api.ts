/**
 * API Domain Whitelist — 前端 API 客户端
 *
 * v3.0: 域名白名单管理 REST API 封装
 * - GET    /api/api-domain-whitelist         — 列表
 * - POST   /api/api-domain-whitelist         — 新增
 * - DELETE /api/api-domain-whitelist/:id     — 删除
 * - POST   /api/api-domain-whitelist/check   — 校验
 */

import { API_BASE_URL } from '../../constants/api.js';

// ===================== Types =====================

export interface WhitelistEntry {
  id: string;
  hostname: string;
  description: string;
  category: 'system' | 'user';
  is_deletable: number;
  created_at: string;
}

export interface WhitelistListResult {
  items: WhitelistEntry[];
  total: number;
}

export interface WhitelistCheckResult {
  hostname: string;
  allowed: boolean;
}

// ===================== Helpers =====================

const BASE = `${API_BASE_URL}/api/api-domain-whitelist`;
const FETCH_TIMEOUT = 15000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===================== API Functions =====================

/** 获取白名单列表（支持分页、搜索、分类筛选） */
export async function fetchWhitelist(params?: {
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<WhitelistListResult> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const query = searchParams.toString();
  const url = `${BASE}${query ? `?${query}` : ''}`;

  const res = await fetchWithTimeout(url);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `获取白名单失败 (HTTP ${res.status})`);
  }

  return json.data ?? json;
}

/** 新增域名到白名单 */
export async function addDomainToWhitelist(
  hostname: string,
  description: string = '',
  category: string = 'user',
): Promise<WhitelistEntry> {
  const res = await fetchWithTimeout(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname, description, category }),
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `添加域名失败 (HTTP ${res.status})`);
  }

  return json.data ?? json;
}

/** 删除域名（仅允许 is_deletable=1 的条目） */
export async function removeDomainFromWhitelist(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE}/${id}`, { method: 'DELETE' });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `删除域名失败 (HTTP ${res.status})`);
  }
}

/** 校验域名是否在白名单中 */
export async function checkDomainAllowed(hostname: string): Promise<WhitelistCheckResult> {
  const res = await fetchWithTimeout(`${BASE}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname }),
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `校验域名失败 (HTTP ${res.status})`);
  }

  return json.data ?? json;
}
