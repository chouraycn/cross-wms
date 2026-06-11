/**
 * API Base URL 工具函数
 *
 * 根据运行环境动态返回后端 API 的基础 URL：
 * - 开发模式（Vite dev server）：http://localhost:3001
 * - 生产模式（pywebview）：使用 window.__PYWEBVIEW_API_URL__ 或回退到 localhost:3001
 *
 * @version 1.9.0
 */

/** pywebview 环境可能注入的全局变量名 */
declare global {
  interface Window {
    /** pywebview 启动时注入的 API URL（可选） */
    __PYWEBVIEW_API_URL__?: string;
  }
}

/**
 * 获取后端 API 基础 URL
 *
 * 判断优先级：
 * 1. window.__PYWEBVIEW_API_URL__（pywebview 显式注入）
 * 2. import.meta.env.DEV === true → 开发模式 → localhost:3001
 * 3. 回退到 localhost:3001（pywebview 前端在 127.0.0.1:9988，后端固定 3001）
 */
export function getApiBaseUrl(): string {
  // 1. pywebview 显式注入
  if (typeof window !== 'undefined' && window.__PYWEBVIEW_API_URL__) {
    return window.__PYWEBVIEW_API_URL__;
  }

  // 2. Vite 开发模式
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }

  // 3. 生产模式（pywebview 内嵌浏览器）
  //    前端 HTTP 服务器在 127.0.0.1:9988，后端 Node.js 在 localhost:3001
  //    ⚠️ 不能使用 window.location.origin（会返回前端端口 9988，而非后端 3001）
  return 'http://localhost:3001';
}

/**
 * 获取完整的 API 端点 URL
 *
 * @param path - API 路径（如 '/api/chat'、'/api/inventory/nl-query'）
 * @returns 完整 URL
 *
 * @example
 * getApiUrl('/api/chat')          // → 'http://localhost:3001/api/chat'
 * getApiUrl('/api/wms/replenishment/42/confirm')
 */
export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
