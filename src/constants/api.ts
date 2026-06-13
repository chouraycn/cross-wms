/**
 * API 基础配置
 *
 * 策略：优先使用相对路径（通过 Vite 代理或 pywebview 代理转发到后端），
 * 仅在无法使用代理时才回退到直连后端。
 *
 * 优先级：import.meta.env.VITE_API_BASE_URL > window.__API_BASE_URL__ > 相对路径 > 默认值
 */

/** API 基础地址 */
const _envBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
export const API_BASE_URL = _envBaseUrl
  || (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__API_BASE_URL__ as string)
  || ''; // 默认使用相对路径，通过 Vite 代理 / pywebview 代理转发

/** API 路径前缀 */
export const API_PREFIX = '/api';

/** 完整 API 基础路径 */
export const API_BASE = `${API_BASE_URL}${API_PREFIX}`;

/** 聊天 API 地址 */
export const CHAT_API_URL = `${API_BASE}/chat`;

/** 库存查询 API 地址 */
export const INVENTORY_QUERY_API_URL = `${API_BASE}/inventory/nl-query`;
