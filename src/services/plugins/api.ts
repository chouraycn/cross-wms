/**
 * Plugin API 客户端 — 封装所有 /api/plugins/* 的 HTTP 调用
 *
 * v3.0: 前端与后端 Plugin REST 端点通信的统一入口
 */

import { API_BASE_URL } from '../../constants/api';

const BASE = `${API_BASE_URL}/api/plugins`;

// v2.3.1: 统一 30s 超时，避免后端挂掉时页面永久转圈
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

import type {
  PluginInfo,
  PluginHealth,
  PluginConfigSchemaField,
  PluginConfigSchema,
  PluginStatus,
  Plugin,
  PluginManifest,
  PluginToolDefinition,
  PluginTrigger,
} from '../../types/plugin';
// Re-export 保持向后兼容（外部代码仍可 from 'services/plugins/api' 导入这些类型）
export type {
  PluginInfo,
  PluginHealth,
  PluginConfigSchemaField,
  PluginConfigSchema,
  PluginStatus,
  Plugin,
  PluginManifest,
  PluginToolDefinition,
  PluginTrigger,
};

/** 获取插件列表 */
export async function fetchPlugins(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ plugins: PluginInfo[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const query = searchParams.toString();
  const url = query ? `${BASE}?${query}` : BASE;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  // 后端返回 { plugins: [...] }
  const plugins = (json.plugins ?? json.data ?? json) as PluginInfo[];
  const total = json.total ?? (Array.isArray(plugins) ? plugins.length : 0);
  return { plugins: Array.isArray(plugins) ? plugins : [], total };
}

/** 获取单个插件详情 */
export async function fetchPlugin(id: string): Promise<PluginInfo> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.plugin ?? json.data ?? json) as PluginInfo;
}

/** 获取插件健康状态 */
export async function fetchPluginHealth(): Promise<PluginHealth> {
  const res = await fetchWithTimeout(`${BASE}/health`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return await res.json();
}

/** 安装插件（上传 .zip 文件） */
export async function installPlugin(file: File): Promise<PluginInfo> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetchWithTimeout(`${BASE}/install`, {
    method: 'POST',
    body: formData,
    // 不设置 Content-Type，让浏览器自动设置 multipart/form-data boundary
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.plugin ?? json.data ?? json) as PluginInfo;
}

/** 启用插件 */
export async function enablePlugin(id: string): Promise<PluginInfo> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.plugin ?? json.data ?? json) as PluginInfo;
}

/** 禁用插件 */
export async function disablePlugin(id: string): Promise<PluginInfo> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.plugin ?? json.data ?? json) as PluginInfo;
}

/** 卸载插件 */
export async function uninstallPlugin(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
}

/** 重新加载插件 */
export async function reloadPlugin(id: string): Promise<PluginInfo> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.plugin ?? json.data ?? json) as PluginInfo;
}

/** 获取插件配置和 Schema */
export async function fetchPluginConfig(id: string): Promise<{
  config: Record<string, unknown>;
  configSchema: PluginConfigSchema | null;
}> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/config`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

/** 更新插件配置 */
export async function updatePluginConfig(
  id: string,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data?.config ?? json.data ?? json;
}

/** 重置插件配置 */
export async function resetPluginConfig(id: string): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${BASE}/${encodeURIComponent(id)}/config/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data?.config ?? json.data ?? json;
}
