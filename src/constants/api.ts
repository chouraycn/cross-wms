/**
 * API 基础配置
 *
 * 支持通过环境变量或运行时配置注入 API 地址。
 * 优先级：import.meta.env.VITE_API_BASE_URL > window.__API_BASE_URL__ > 默认值
 *
 * 使用方式：
 *   import { API_BASE_URL } from '../constants/api';
 *   fetch(`${API_BASE_URL}/api/chat`)
 */

/** API 基础地址 */
const _envBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
export const API_BASE_URL = _envBaseUrl
  || (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__API_BASE_URL__ as string)
  || 'http://localhost:3001';

/** API 路径前缀 */
export const API_PREFIX = '/api';

/** 完整 API 基础路径 */
export const API_BASE = `${API_BASE_URL}${API_PREFIX}`;

/** 聊天 API 地址 */
export const CHAT_API_URL = `${API_BASE}/chat`;

/** 库存查询 API 地址 */
export const INVENTORY_QUERY_API_URL = `${API_BASE}/inventory/nl-query`;
