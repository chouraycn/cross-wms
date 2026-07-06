/**
 * Extension API 客户端 — 封装所有 /api/extensions/* 的 HTTP 调用
 *
 * 前端与后端 Extension REST 端点通信的统一入口
 */

import { API_BASE_URL } from '../../constants/api';

const BASE = `${API_BASE_URL}/api/extensions`;

const FETCH_TIMEOUT = 30000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时（30秒），请检查后端是否正常运行');
    }
    throw err;
  }
}

/** 扩展信息 */
export interface ExtensionInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  kind: string;
  enabled: boolean;
  sdkVersion?: string;
  requiresAuth?: boolean;
  authType?: string;
  dependencies?: Record<string, string>;
}

/** 扩展类型 */
export interface ExtensionKind {
  kind: string;
  label: string;
  description: string;
}

/** 扩展统计 */
export interface ExtensionStats {
  total: number;
  enabled: number;
  disabled: number;
  byKind: Record<string, number>;
}

/** 扩展详情 */
export interface ExtensionDetail extends ExtensionInfo {
  manifest?: Record<string, unknown>;
}

/** 获取扩展列表 */
export async function fetchExtensions(params?: {
  kind?: string;
  enabled?: boolean;
}): Promise<ExtensionInfo[]> {
  const searchParams = new URLSearchParams();
  if (params?.kind) searchParams.set('kind', params.kind);
  if (params?.enabled !== undefined) searchParams.set('enabled', String(params.enabled));

  const query = searchParams.toString();
  const url = query ? `${BASE}?${query}` : BASE;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as ExtensionInfo[];
}

/** 获取单个扩展详情 */
export async function fetchExtension(id: string): Promise<ExtensionDetail> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as ExtensionDetail;
}

/** 发现可用扩展 */
export async function discoverExtensions(dir?: string): Promise<ExtensionInfo[]> {
  const searchParams = new URLSearchParams();
  if (dir) searchParams.set('dir', dir);

  const query = searchParams.toString();
  const url = query ? `${BASE}/discover?${query}` : `${BASE}/discover`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as ExtensionInfo[];
}

/** 加载扩展 */
export async function loadExtension(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return await res.json().then((j) => j.data);
}

/** 启用扩展 */
export async function enableExtension(id: string, config?: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return await res.json().then((j) => j.data);
}

/** 禁用扩展 */
export async function disableExtension(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return await res.json().then((j) => j.data);
}

/** 加载所有扩展 */
export async function loadAllExtensions(): Promise<{ success: boolean; loadedCount: number }> {
  const res = await fetchWithTimeout(`${BASE}/load-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return await res.json().then((j) => j.data);
}

/** 获取扩展统计 */
export async function fetchExtensionStats(): Promise<ExtensionStats> {
  const res = await fetchWithTimeout(`${BASE}/stats/summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as ExtensionStats;
}

/** 获取扩展类型列表 */
export async function fetchExtensionKinds(): Promise<ExtensionKind[]> {
  const res = await fetchWithTimeout(`${BASE}/kinds`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? json) as ExtensionKind[];
}