/**
 * API History — 前端 API 客户端
 *
 * v3.0: 请求历史管理 REST API 封装
 * - GET    /api/api-history           — 分页列表
 * - GET    /api/api-history/:id       — 单条详情
 * - DELETE /api/api-history/:id       — 删除单条
 * - DELETE /api/api-history           — 清空全部
 */

import { API_BASE_URL } from '../../constants/api.js';

// ===================== Types =====================

export interface ApiHistoryRecord {
  id: string;
  templateId: string | null;
  url: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  isSuccess: boolean;
  extractedPreview: string | null;
  error: string | null;
  executedAt: string;
  requestHeaders: string | null;
  requestBody: string | null;
  responseHeaders: string | null;
  responseBody: string | null;
}

export interface ApiHistoryListResult {
  items: ApiHistoryRecord[];
  total: number;
}

// ===================== Helpers =====================

const BASE = `${API_BASE_URL}/api/api-history`;
const FETCH_TIMEOUT = 15000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
}

/** 将后端 snake_case 行映射为前端 camelCase */
function mapRow(row: Record<string, unknown>): ApiHistoryRecord {
  return {
    id: row.id as string,
    templateId: (row.template_id ?? row.templateId) as string | null,
    url: row.url as string,
    method: row.method as string,
    statusCode: (row.status_code ?? row.statusCode) as number | null,
    durationMs: (row.duration_ms ?? row.durationMs) as number,
    isSuccess: Boolean(row.is_success ?? row.isSuccess),
    extractedPreview: (row.extracted_preview ?? row.extractedPreview) as string | null,
    error: row.error as string | null,
    executedAt: (row.executed_at ?? row.executedAt) as string,
    requestHeaders: (row.request_headers ?? row.requestHeaders) as string | null,
    requestBody: (row.request_body ?? row.requestBody) as string | null,
    responseHeaders: (row.response_headers ?? row.responseHeaders) as string | null,
    responseBody: (row.response_body ?? row.responseBody) as string | null,
  };
}

// ===================== API Functions =====================

/** 获取请求历史列表（分页、可选模板过滤） */
export async function fetchHistory(params?: {
  templateId?: string;
  page?: number;
  pageSize?: number;
}): Promise<ApiHistoryListResult> {
  const searchParams = new URLSearchParams();
  if (params?.templateId) searchParams.set('templateId', params.templateId);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const query = searchParams.toString();
  const url = `${BASE}${query ? `?${query}` : ''}`;

  const res = await fetchWithTimeout(url);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `获取请求历史失败 (HTTP ${res.status})`);
  }

  const data = json.data ?? json;
  const items = (data.items || []).map(mapRow);
  return { items, total: data.total ?? items.length };
}

/** 获取单条请求历史详情 */
export async function fetchHistoryDetail(id: string): Promise<ApiHistoryRecord> {
  const res = await fetchWithTimeout(`${BASE}/${id}`);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `获取请求记录失败 (HTTP ${res.status})`);
  }

  return mapRow(json.data ?? json);
}

/** 删除单条请求历史 */
export async function deleteHistoryRecord(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE}/${id}`, { method: 'DELETE' });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `删除请求记录失败 (HTTP ${res.status})`);
  }
}

/** 清空所有请求历史 */
export async function clearAllHistory(): Promise<{ deletedCount: number }> {
  const res = await fetchWithTimeout(BASE, { method: 'DELETE' });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `清空请求历史失败 (HTTP ${res.status})`);
  }

  return json.data ?? json;
}
