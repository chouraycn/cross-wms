/**
 * API Key Management API 客户端
 */

import { API_BASE_URL } from '../../constants/api';

const BASE = `${API_BASE_URL}/api/apikeys`;

const FETCH_TIMEOUT = 10000;

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
      throw new Error('请求超时，请检查后端是否正常运行');
    }
    throw err;
  }
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  enabled: boolean;
  createdAt: number;
  lastUsedAt?: number;
  rateLimitPerMinute: number;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyWithSecret extends ApiKeyRecord {
  key: string;
}

export interface ApiKeyStats {
  total: number;
  enabled: number;
  disabled: number;
}

export async function fetchApiKeys(): Promise<ApiKeyRecord[]> {
  const res = await fetchWithTimeout(BASE);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? []) as ApiKeyRecord[];
}

export async function createApiKey(params: {
  name: string;
  rateLimitPerMinute?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ data: ApiKeyWithSecret; warning: string }> {
  const res = await fetchWithTimeout(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return await res.json();
}

export async function enableApiKey(id: string): Promise<{ id: string; enabled: boolean }> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

export async function disableApiKey(id: string): Promise<{ id: string; enabled: boolean }> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

export async function deleteApiKey(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
}

export async function fetchApiKeyStats(): Promise<ApiKeyStats> {
  const res = await fetchWithTimeout(`${BASE}/stats`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data as ApiKeyStats;
}
