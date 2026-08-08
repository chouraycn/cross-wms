/**
 * HTTP 工具统一执行原语 — 收敛「核心 web_api_call」与「数字员工 http 工具」两套重复实现。
 *
 * 背景（2026-08-04 P1.1 去重）：
 * - `server/engine/webTools.ts:handleWebApiCall` 原用**裸 fetch**（仅域名白名单，无 SSRF 守卫）
 * - `server/staff/staffHttpToolBridge.ts:executeStaffHttpTool` 用 `fetchWithSsrFGuard`（含 DNS 钉扎）
 * 两处各自实现「超时 / 响应读取 / JSON 解析 / 截断 / 错误包装」，逻辑重复且安全等级不一致。
 *
 * 本模块把执行层收敛为一份，并**统一向上对齐到 SSRF 守卫**（核心侧属安全升级，非降级）。
 * 差异化的部分（域名白名单、鉴权预置、工具名/schema）保留在各自调用方，因为那是功能而非重复。
 */
import { fetchWithSsrFGuard } from './fetch-guard.js';
import { DEFAULT_SSRF_POLICY } from './ssrf.js';

// ===================== 常量 =====================

/** 默认响应体截断阈值（字符数），与原 web_api_call / staff bridge 行为保持一致 */
export const DEFAULT_TRUNCATE_CHARS = 50_000;

/** 默认超时（毫秒） */
export const DEFAULT_HTTP_TOOL_TIMEOUT_MS = 30_000;

/** 无请求体的 HTTP 方法 */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

// ===================== 类型 =====================

export interface GuardedHttpRequestParams {
  /** 请求 URL */
  url: string;
  /** HTTP 方法，默认 GET */
  method?: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体（字符串；对象请调用方自行 JSON.stringify） */
  body?: string;
  /** 超时（毫秒），默认 30s */
  timeoutMs?: number;
  /**
   * 是否允许访问内网地址。
   * - 核心 web_api_call：false（严格外网，配合域名白名单）
   * - 数字员工 http 工具：true（企业内网 API 是主要场景）
   */
  allowPrivateNetwork?: boolean;
  /** 响应截断阈值（字符数） */
  truncateChars?: number;
  /** 自定义 User-Agent */
  userAgent?: string;
}

export interface GuardedHttpRequestResult {
  /** HTTP 状态是否 2xx（网络层失败时为 false） */
  ok: boolean;
  /** HTTP 状态码，网络层失败时为 undefined */
  status?: number;
  statusText?: string;
  contentType?: string;
  /** 原始响应文本（已按 truncateChars 截断） */
  text: string;
  /** content-type 为 JSON 时的解析结果；否则等于 text */
  data: any;
  /** 是否发生截断 */
  truncated: boolean;
  /** 跟随重定向后的最终 URL */
  finalUrl?: string;
  /** 网络层错误信息（DNS / 超时 / SSRF 拦截等）；HTTP 4xx/5xx 不算此类 */
  transportError?: string;
}

// ===================== 执行 =====================

/**
 * 以 SSRF 守卫执行一次 HTTP 请求，并统一处理超时、响应读取、JSON 解析、截断与错误包装。
 *
 * 注意：本函数**不做域名白名单校验**——白名单是核心 web_api_call 的策略，
 * 数字员工工具走的是「管理员预配置」信任模型，两者由调用方各自决定。
 */
export async function executeGuardedHttpRequest(
  params: GuardedHttpRequestParams,
): Promise<GuardedHttpRequestResult> {
  const method = String(params.method || 'GET').toUpperCase();
  const truncateChars = params.truncateChars ?? DEFAULT_TRUNCATE_CHARS;
  const headers: Record<string, string> = { ...(params.headers || {}) };

  if (params.userAgent && !hasHeader(headers, 'user-agent')) {
    headers['User-Agent'] = params.userAgent;
  }

  const options: RequestInit = { method, headers };

  if (params.body !== undefined && !BODYLESS_METHODS.has(method)) {
    if (!hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    options.body = params.body;
  }

  try {
    const result = await fetchWithSsrFGuard({
      url: params.url,
      options,
      policy: {
        ...DEFAULT_SSRF_POLICY,
        dangerouslyAllowPrivateNetwork: params.allowPrivateNetwork === true,
      },
      timeoutMs: params.timeoutMs ?? DEFAULT_HTTP_TOOL_TIMEOUT_MS,
    });

    const response = result.response;
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    let truncated = false;
    let text = rawText;
    if (text.length > truncateChars) {
      text = text.substring(0, truncateChars) +
        `\n\n> ⚠️ 响应过长，已截断至 ${Math.round(truncateChars / 1000)}K 字符`;
      truncated = true;
    }

    let data: any = text;
    if (contentType.includes('application/json') || contentType.includes('+json')) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = text;
      }
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      contentType,
      text,
      data,
      truncated,
      finalUrl: result.finalUrl,
    };
  } catch (err) {
    return {
      ok: false,
      text: '',
      data: undefined,
      truncated: false,
      transportError: normalizeTransportError(err),
    };
  }
}

// ===================== 辅助 =====================

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function normalizeTransportError(err: any): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return '请求超时';
  }
  if (err instanceof Error) {
    // fetch-guard 的 SSRF 拦截也走 Error 抛出
    return err.message;
  }
  return String(err);
}
