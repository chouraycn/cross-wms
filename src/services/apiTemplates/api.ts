/**
 * API Templates — 前端 API 客户端
 *
 * v3.0: API 模板管理 REST API 封装
 * - GET    /api/api-templates              — 列表
 * - GET    /api/api-templates/:id          — 获取单个
 * - POST   /api/api-templates              — 创建
 * - PUT    /api/api-templates/:id          — 更新
 * - DELETE /api/api-templates/:id          — 删除
 * - POST   /api/api-templates/:id/test     — 测试
 */

import { API_BASE_URL } from '../../constants/api.js';

// ===================== Types =====================

export interface ApiTemplateInfo {
  id: string;
  name: string;
  description: string;
  domain: string;
  method: string;
  pathTemplate: string;
  headersJson: string;
  bodyTemplate: string;
  responsePath: string;
  responseExtractor: string;
  riskLevel: string;
  isBuiltin: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ===================== Helpers =====================

const BASE = `${API_BASE_URL}/api/api-templates`;
const FETCH_TIMEOUT = 30000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
}

/** 将后端 snake_case 行映射为前端 camelCase */
function mapRow(row: Record<string, unknown>): ApiTemplateInfo {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    domain: row.domain as string,
    method: row.method as string,
    pathTemplate: (row.path_template ?? row.pathTemplate) as string,
    headersJson: (row.headers_json ?? row.headersJson) as string,
    bodyTemplate: (row.body_template ?? row.bodyTemplate) as string,
    responsePath: (row.response_path ?? row.responsePath) as string,
    responseExtractor: (row.response_extractor ?? row.responseExtractor) as string,
    riskLevel: (row.risk_level ?? row.riskLevel) as string,
    isBuiltin: Boolean(row.is_builtin ?? row.isBuiltin),
    tags: Array.isArray(row.tags) ? row.tags as string[] : [],
    createdAt: (row.created_at ?? row.createdAt) as string,
    updatedAt: (row.updated_at ?? row.updatedAt) as string,
  };
}

// ===================== API Functions =====================

/** 获取模板列表（分页、搜索、过滤） */
export async function fetchTemplates(params?: {
  domain?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ApiTemplateInfo[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.domain) searchParams.set('domain', params.domain);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const query = searchParams.toString();
  const url = `${BASE}${query ? `?${query}` : ''}`;

  const res = await fetchWithTimeout(url);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `获取模板列表失败 (HTTP ${res.status})`);
  }

  const data = json.data ?? json;
  const items = (data.items || []).map(mapRow);
  return { items, total: data.total ?? items.length };
}

/** 获取单个模板详情 */
export async function fetchTemplate(id: string): Promise<ApiTemplateInfo> {
  const res = await fetchWithTimeout(`${BASE}/${id}`);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `获取模板失败 (HTTP ${res.status})`);
  }

  return mapRow(json.data ?? json);
}

/** 创建新模板 */
export async function createTemplate(data: Partial<ApiTemplateInfo>): Promise<ApiTemplateInfo> {
  // 将 camelCase 转为后端 snake_case
  const body: Record<string, unknown> = {
    name: data.name,
    description: data.description,
    domain: data.domain,
    method: data.method,
    pathTemplate: data.pathTemplate,
    headersJson: data.headersJson,
    bodyTemplate: data.bodyTemplate,
    responsePath: data.responsePath,
    responseExtractor: data.responseExtractor,
    riskLevel: data.riskLevel,
    tags: data.tags,
  };

  const res = await fetchWithTimeout(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `创建模板失败 (HTTP ${res.status})`);
  }

  return mapRow(json.data ?? json);
}

/** 更新模板 */
export async function updateTemplate(id: string, data: Partial<ApiTemplateInfo>): Promise<ApiTemplateInfo> {
  const body: Record<string, unknown> = {
    name: data.name,
    description: data.description,
    domain: data.domain,
    method: data.method,
    pathTemplate: data.pathTemplate,
    headersJson: data.headersJson,
    bodyTemplate: data.bodyTemplate,
    responsePath: data.responsePath,
    responseExtractor: data.responseExtractor,
    riskLevel: data.riskLevel,
    tags: data.tags,
  };

  const res = await fetchWithTimeout(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `更新模板失败 (HTTP ${res.status})`);
  }

  return mapRow(json.data ?? json);
}

/** 删除模板 */
export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE}/${id}`, { method: 'DELETE' });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `删除模板失败 (HTTP ${res.status})`);
  }
}

/** 测试模板执行 */
export async function testTemplate(
  id: string,
  variables?: Record<string, string>,
  extraHeaders?: Record<string, string>,
): Promise<any> {
  const res = await fetchWithTimeout(`${BASE}/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables: variables || {}, extraHeaders }),
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `测试模板失败 (HTTP ${res.status})`);
  }

  return json.data ?? json;
}
