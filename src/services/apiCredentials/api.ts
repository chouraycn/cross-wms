/**
 * API Credentials — 前端 API 客户端
 *
 * v3.0: 凭证管理 REST API 封装
 * - GET    /api/api-credentials           — 列出凭证（不含明文值）
 * - GET    /api/api-credentials/:id       — 获取凭证详情
 * - POST   /api/api-credentials           — 创建凭证
 * - PUT    /api/api-credentials/:id       — 更新凭证
 * - DELETE /api/api-credentials/:id       — 删除凭证
 */

import { API_BASE_URL } from '../../constants/api.js';

// ===================== Types =====================

export interface ApiCredential {
  id: string;
  name: string;
  credentialType: string;
  domain: string;
  headerName: string;
  expiresAt: string | null;
  hasValue: boolean;
  createdAt: string;
  updatedAt: string;
}

// ===================== Helpers =====================

const BASE = `${API_BASE_URL}/api/api-credentials`;
const FETCH_TIMEOUT = 15000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
}

/** 将后端 snake_case 行映射为前端 camelCase */
function mapRow(row: Record<string, unknown>): ApiCredential {
  return {
    id: row.id as string,
    name: row.name as string,
    credentialType: (row.credential_type ?? row.credentialType) as string,
    domain: row.domain as string,
    headerName: (row.header_name ?? row.headerName) as string,
    expiresAt: (row.expires_at ?? row.expiresAt) as string | null,
    hasValue: Boolean(row.has_value ?? row.hasValue),
    createdAt: (row.created_at ?? row.createdAt) as string,
    updatedAt: (row.updated_at ?? row.updatedAt) as string,
  };
}

// ===================== API Functions =====================

/** 获取凭证列表（可选按 domain 过滤） */
export async function fetchCredentials(domain?: string): Promise<ApiCredential[]> {
  const searchParams = new URLSearchParams();
  if (domain) searchParams.set('domain', domain);

  const query = searchParams.toString();
  const url = `${BASE}${query ? `?${query}` : ''}`;

  const res = await fetchWithTimeout(url);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `获取凭证列表失败 (HTTP ${res.status})`);
  }

  const data = json.data ?? json;
  return (Array.isArray(data) ? data : []).map(mapRow);
}

/** 获取单个凭证详情 */
export async function fetchCredential(id: string): Promise<ApiCredential> {
  const res = await fetchWithTimeout(`${BASE}/${id}`);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `获取凭证失败 (HTTP ${res.status})`);
  }

  return mapRow(json.data ?? json);
}

/** 创建凭证 */
export async function createCredential(data: {
  name: string;
  credentialType: string;
  value: string;
  domain: string;
  headerName?: string;
}): Promise<ApiCredential> {
  const res = await fetchWithTimeout(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      credentialType: data.credentialType,
      value: data.value,
      domain: data.domain,
      headerName: data.headerName,
    }),
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `创建凭证失败 (HTTP ${res.status})`);
  }

  return mapRow(json.data ?? json);
}

/** 更新凭证 */
export async function updateCredential(
  id: string,
  data: Partial<{
    name: string;
    value: string;
    domain: string;
    headerName: string;
    credentialType: string;
  }>,
): Promise<ApiCredential> {
  const res = await fetchWithTimeout(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `更新凭证失败 (HTTP ${res.status})`);
  }

  return mapRow(json.data ?? json);
}

/** 删除凭证 */
export async function deleteCredential(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE}/${id}`, { method: 'DELETE' });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `删除凭证失败 (HTTP ${res.status})`);
  }
}
