/**
 * 腾讯文档 API 服务 — 通过 pywebview js_api 桥接读取文档内容
 *
 * v3: 纯本地化方案
 * - 不使用 localhost HTTP 服务器
 * - 通过 window.pywebview.api.xxx() 直接调用 Python 方法
 * - 前端不需要 HTTP 服务器即可运行
 */

// ===================== 类型定义 =====================

export interface TDocAuthStatus {
  authenticated: boolean;
  hasToken: boolean;
  isExpired: boolean;
  clientId?: string;
}

export interface TDocAuthToken {
  ok: boolean;
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/** 腾讯文档 AST 节点 */
export interface TDocNode {
  begin: number;
  end: number;
  type: string;
  children: TDocNode[];
  text?: string;
  property?: Record<string, unknown>;
  meta?: unknown;
}

/** 文档内容响应 */
export interface TDocContent {
  document: TDocNode;
  version: number;
}

/** Sheet 单元格 */
export interface SheetCell {
  cellFormat: unknown;
  cellValue: {
    text?: string;
    location?: { name: string; latitude: string; longitude: string };
    [key: string]: unknown;
  };
  dataType: string;
}

/** Sheet 行 */
export interface SheetRow {
  values: SheetCell[];
}

/** Sheet 内容响应 */
export interface SheetContent {
  gridData: {
    columnMetadata: unknown[];
    rowMetadata: unknown[];
    rows: SheetRow[];
    startColumn: number;
    startRow: number;
  };
}

// ===================== pywebview 桥接 =====================

/**
 * pywebview JS API 桥接
 * 在 pywebview 环境中，window.pywebview.api 上挂载了 Python Api 类的方法
 * 所有方法返回 JSON 字符串，需要解析
 */
interface PyWebViewApi {
  get_version: () => Promise<string>;
  tdoc_status: () => Promise<string>;
  tdoc_auth_url: (clientId: string, clientSecret: string) => Promise<string>;
  tdoc_exchange_token: (code: string) => Promise<string>;
  tdoc_refresh_token: () => Promise<string>;
  tdoc_doc_content: (fileId: string) => Promise<string>;
  tdoc_sheet_content: (fileId: string, sheetId: string, rangeStr?: string) => Promise<string>;
  tdoc_sheet_info: (fileId: string) => Promise<string>;
  open_in_browser: (url: string) => Promise<string>;
  get_release_info: () => Promise<string>;   // 获取 GitHub release.json（绕过 CORS）
  window_close: () => Promise<string>;
  window_minimize: () => Promise<string>;
  window_maximize: () => Promise<string>;
  window_toggle_fullscreen: () => Promise<string>;
  get_traffic_light_offset: () => Promise<string>;
  set_traffic_light_offset: (x: number, y: number) => Promise<string>;

  // ---- 企业微信文档 ----
  wecom_check_auth: () => Promise<string>;
  wecom_doc_content: (docid: string, docCategory: string) => Promise<string>;
  wecom_smartsheet_structure: (docid: string) => Promise<string>;
  wecom_smartsheet_data: (docid: string, sheetId: string) => Promise<string>;
  wecom_smartpage_content: (docid: string) => Promise<string>;
}

declare global {
  interface Window {
    pywebview?: {
      api: PyWebViewApi;
    };
  }
}

import { isPyWebView as _isPyWebView } from '../utils/env';

/** 是否在 pywebview 环境中运行 */
export const isPyWebView = _isPyWebView;

/**
 * pywebview 首次注入的是核心 JS 桥接对象（'pywebview' in window 可用），
 * 但 .api（Python 端桥接）可能有延迟。
 * 此函数返回 Promise，在 .api 就绪时 resolve。
 */
export function waitPyWebViewReady(timeout = 3000): Promise<boolean> {
  if (!isPyWebView()) return Promise.resolve(false);
  if (window.pywebview?.api) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), timeout);
    const id = setInterval(() => {
      if (window.pywebview?.api) {
        clearInterval(id);
        clearTimeout(timer);
        resolve(true);
      }
    }, 100);
  });
}

/**
 * 等待 pywebview API 就绪
 * pywebview 注入 api 对象可能稍有延迟
 */
function waitForApi(timeout = 5000): Promise<PyWebViewApi> {
  return new Promise((resolve, reject) => {
    if (window.pywebview?.api) {
      resolve(window.pywebview.api);
      return;
    }
    const start = Date.now();
    const check = () => {
      if (window.pywebview?.api) {
        resolve(window.pywebview.api);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error('pywebview API 未就绪（超时）'));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

/**
 * 调用 pywebview API 方法并解析 JSON 结果
 */
export async function callApi<T>(method: keyof PyWebViewApi, ...args: unknown[]): Promise<T> {
  const api = await waitForApi();
  const fn = api[method] as (...a: unknown[]) => Promise<string>;
  let jsonStr: string;
  try {
    jsonStr = await fn(...args);
  } catch (e) {
    throw new Error(`pywebview API 调用失败: ${e instanceof Error ? e.message : String(e)}`);
  }
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(jsonStr);
  } catch {
    throw new Error(`pywebview API 返回非 JSON 数据: ${jsonStr.slice(0, 100)}`);
  }

  // 如果 Python API 返回了错误结构，原样返回让调用方处理，不抛异常
  if (result.error && !result.ok) {
    return { ok: false, error: result.error } as unknown as T;
  }

  return result as T;
}

// ===================== 公共接口 =====================

/** 获取认证状态 */
export async function getAuthStatus(): Promise<TDocAuthStatus> {
  return callApi<TDocAuthStatus>('tdoc_status');
}

/** 生成 OAuth 授权 URL */
export async function getAuthUrl(clientId: string, clientSecret: string): Promise<{ auth_url: string }> {
  return callApi<{ auth_url: string }>('tdoc_auth_url', clientId, clientSecret);
}

/** 用授权码换取 Token */
export async function exchangeToken(code: string): Promise<TDocAuthToken> {
  return callApi<TDocAuthToken>('tdoc_exchange_token', code);
}

/** 刷新 Token */
export async function refreshToken(): Promise<TDocAuthToken> {
  return callApi<TDocAuthToken>('tdoc_refresh_token');
}

/** 获取文档内容（Doc 类型） */
export async function getDocContent(fileId: string): Promise<TDocContent> {
  return callApi<TDocContent>('tdoc_doc_content', fileId);
}

/** 获取表格内容（Sheet 类型） */
export async function getSheetContent(
  fileId: string,
  sheetId: string,
  range = 'A1:Z200'
): Promise<SheetContent> {
  return callApi<SheetContent>('tdoc_sheet_content', fileId, sheetId, range);
}

/** 获取表格子表信息 */
export async function getSheetInfo(fileId: string): Promise<unknown> {
  return callApi<unknown>('tdoc_sheet_info', fileId);
}

// ===================== 文档内容解析工具 =====================

/**
 * 从腾讯文档 AST 树中提取纯文本
 */
export function extractTextFromDoc(node: TDocNode): string {
  if (!node) return '';
  if (node.type === 'Text' && node.text) {
    return node.text;
  }
  if (node.children && node.children.length > 0) {
    const parts: string[] = [];
    for (const child of node.children) {
      const text = extractTextFromDoc(child);
      if (text) parts.push(text);
    }
    // Paragraph 之间加换行
    if (node.type === 'Paragraph') {
      return parts.join('') + '\n';
    }
    return parts.join('');
  }
  return '';
}

/**
 * 从腾讯文档 AST 树转换为 Markdown
 */
export function docToMarkdown(node: TDocNode): string {
  if (!node) return '';
  if (node.type === 'Text' && node.text) {
    return node.text;
  }
  if (node.children && node.children.length > 0) {
    const parts: string[] = [];
    for (const child of node.children) {
      const text = docToMarkdown(child);
      if (text) parts.push(text);
    }
    if (node.type === 'Paragraph') {
      const prop = node.property as { paragraphProperty?: { numberProperty?: { nestingLevel: number } } } | undefined;
      const nestingLevel = prop?.paragraphProperty?.numberProperty?.nestingLevel ?? 0;
      // 检查是否有标题属性（通过 runProperty）
      const runProp = (node.property as { runProperty?: { bold?: boolean; size?: number } } | undefined)?.runProperty;
      if (runProp?.bold && ((runProp?.size ?? 0) > 0)) {
        const heading = '#'.repeat(Math.min(Math.max(Math.round((runProp?.size ?? 0) / 4), 1), 4));
        return `${heading} ${parts.join('')}\n\n`;
      }
      if (nestingLevel > 0) {
        return '  '.repeat(nestingLevel) + '- ' + parts.join('') + '\n';
      }
      return parts.join('') + '\n';
    }
    if (node.type === 'Run') {
      const prop = node.property as { runProperty?: { bold?: boolean; italics?: boolean; strike?: boolean } } | undefined;
      const rp = prop?.runProperty;
      let text = parts.join('');
      if (rp?.bold) text = `**${text}**`;
      if (rp?.italics) text = `*${text}*`;
      if (rp?.strike) text = `~~${text}~~`;
      return text;
    }
    if (node.type === 'Section' || node.type === 'MainStory' || node.type === 'Document') {
      return parts.join('');
    }
    return parts.join('');
  }
  return '';
}

/**
 * 从 URL 中提取 fileId
 * 支持格式：https://docs.qq.com/doc/DXXXX 或 https://docs.qq.com/sheet/DXXXX
 */
export function extractFileIdFromUrl(url: string): string {
  // 尝试匹配 /doc/ 或 /sheet/ 后的 ID
  const match = url.match(/docs\.qq\.com\/(doc|sheet)\/([A-Za-z0-9_]+)/);
  if (match) return match[2];
  // 如果直接就是 fileId
  if (/^[A-Za-z0-9_]+$/.test(url)) return url;
  return '';
}

/**
 * 判断文档类型
 */
export function getDocTypeFromUrl(url: string): 'doc' | 'sheet' | 'unknown' {
  if (url.includes('/sheet/')) return 'sheet';
  if (url.includes('/doc/')) return 'doc';
  return 'unknown';
}
