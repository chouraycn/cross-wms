/**
 * Metrics API 客户端 — 系统指标 HTTP 调用封装
 */

import { API_BASE_URL } from '../../constants/api';

const BASE = `${API_BASE_URL}/api/metrics`;

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

export interface SystemMetricsData {
  timestamp: number;
  plugins: {
    total: number;
    enabled: number;
    disabled: number;
    errors: number;
  };
  extensions: {
    total: number;
    enabled: number;
    disabled: number;
    byKind: Record<string, number>;
  };
  messages: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    byPhase: Record<string, number>;
  };
  retryQueue: {
    queued: number;
    processing: number;
    deadLetter: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  uptime: number;
}

export async function fetchCurrentMetrics(): Promise<SystemMetricsData> {
  const res = await fetchWithTimeout(`${BASE}/current`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data as SystemMetricsData;
}

export async function fetchMetricsHistory(minutes?: number): Promise<SystemMetricsData[]> {
  const url = minutes ? `${BASE}/history?minutes=${minutes}` : `${BASE}/history`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? []) as SystemMetricsData[];
}
