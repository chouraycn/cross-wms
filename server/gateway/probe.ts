/**
 * Gateway 连接探测客户端
 *
 * 参考 openclaw/src/gateway/probe.ts 的探测架构：
 * - 连接可达性：HTTP /health 端点探测
 * - 认证状态：尝试已认证端点，判断凭据是否有效
 * - 版本兼容性：对比客户端与服务端版本
 * - 延迟测量：从发起请求到收到响应的耗时
 *
 * 超时控制（默认 5 秒），支持 AbortSignal 中断。
 */

import { logger } from "../logger.js";
import { isSecureWebSocketUrl } from "./net.js";

// ==================== 常量 ====================

/** 默认探测超时（毫秒） */
export const DEFAULT_PROBE_TIMEOUT_MS = 5_000;
/** 最小探测超时（毫秒） */
export const MIN_PROBE_TIMEOUT_MS = 250;
/** 最大安全定时器延迟（毫秒），防止 32 位整数溢出 */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;
/** 已知兼容的服务端版本下限 */
const MIN_SERVER_VERSION = "1.0.0";

// ==================== 类型定义 ====================

/** 探测认证凭据 */
export type GatewayProbeAuth = {
  token?: string;
  password?: string;
};

/** 探测关闭信息 */
export type GatewayProbeClose = {
  code: number;
  reason: string;
  hint?: string;
};

/** 探测能力等级 */
export type GatewayProbeCapability =
  | "unknown"
  | "auth_failed"
  | "connected_no_auth"
  | "read_only"
  | "write_capable"
  | "admin_capable";

/** 探测认证摘要 */
export type GatewayProbeAuthSummary = {
  role: string | null;
  scopes: string[];
  capability: GatewayProbeCapability;
};

/** 探测服务端摘要 */
export type GatewayProbeServerSummary = {
  version: string | null;
  connId: string | null;
};

/** 探测状态枚举 */
export type GatewayProbeStatus =
  | "reachable"
  | "unreachable"
  | "auth_required"
  | "version_mismatch"
  | "timeout";

/** 探测结果 */
export type GatewayProbeResult = {
  ok: boolean;
  status: GatewayProbeStatus;
  url: string;
  connectLatencyMs: number | null;
  error: string | null;
  close: GatewayProbeClose | null;
  auth: GatewayProbeAuthSummary;
  server: GatewayProbeServerSummary;
  health: unknown;
  versionCompatible: boolean;
};

// ==================== 辅助函数 ====================

/** 钳制探测超时到安全范围 */
export function clampProbeTimeoutMs(timeoutMs: number): number {
  const clamped = Math.max(MIN_PROBE_TIMEOUT_MS, Math.min(timeoutMs, MAX_TIMER_DELAY_MS));
  return Number.isFinite(clamped) ? clamped : DEFAULT_PROBE_TIMEOUT_MS;
}

/** 格式化探测关闭错误消息 */
function formatProbeCloseError(close: GatewayProbeClose): string {
  return `gateway closed (${close.code}): ${close.reason}`;
}

/** 空认证摘要 */
function emptyProbeAuth(): GatewayProbeAuthSummary {
  return {
    role: null,
    scopes: [],
    capability: "unknown",
  };
}

/** 空服务端摘要 */
function emptyProbeServer(): GatewayProbeServerSummary {
  return {
    version: null,
    connId: null,
  };
}

/** 判断探测是否携带认证凭据 */
function hasProbeAuth(auth: GatewayProbeAuth | undefined): boolean {
  return Boolean(auth?.token?.trim() || auth?.password?.trim());
}

/** 从 URL 提取基础 HTTP URL（用于 HTTP 探测） */
function resolveHttpBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // ws(s):// → http(s)://
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }
    // 移除 WebSocket 路径后缀，使用根路径
    if (parsed.pathname.endsWith("/gateway/ws")) {
      parsed.pathname = parsed.pathname.slice(0, -"/gateway/ws".length) || "/";
    }
    return parsed.origin;
  } catch {
    return url;
  }
}

/**
 * 比较语义化版本号
 * @returns 正数表示 v1 > v2，负数表示 v1 < v2，0 表示相等
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = v2.split(".").map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 !== p2) {
      return p1 - p2;
    }
  }
  return 0;
}

/** 检查服务端版本是否兼容 */
function isVersionCompatible(serverVersion: string | null): boolean {
  if (!serverVersion) {
    // 无法获取版本时视为兼容（不阻断探测）
    return true;
  }
  return compareVersions(serverVersion, MIN_SERVER_VERSION) >= 0;
}

/**
 * 解析探测能力等级
 *
 * 根据认证状态、scopes 和连接结果判断客户端能力等级。
 */
export function resolveGatewayProbeCapability(params: {
  auth?: Pick<GatewayProbeAuthSummary, "scopes"> | null;
  authMetadataPresent?: boolean;
  error?: string | null;
  close?: GatewayProbeClose | null;
  verifiedRead?: boolean;
  connectLatencyMs?: number | null;
}): GatewayProbeCapability {
  const scopes = Array.isArray(params.auth?.scopes) ? params.auth!.scopes : [];
  if (scopes.includes("operator.admin")) {
    return "admin_capable";
  }
  if (scopes.includes("operator.write")) {
    return "write_capable";
  }
  if (scopes.includes("operator.read") || params.verifiedRead === true) {
    return "read_only";
  }
  if (params.connectLatencyMs != null && params.authMetadataPresent === true) {
    return "connected_no_auth";
  }
  // 认证失败模式：连接成功但认证被拒
  if (params.close?.code === 1008 || /auth|unauthorized|forbidden/i.test(params.error ?? "")) {
    return "auth_failed";
  }
  return "unknown";
}

/** 构建认证摘要 */
function resolveProbeAuthSummary(params: {
  role?: string | null;
  scopes?: string[];
  authMetadataPresent?: boolean;
  error?: string | null;
  close?: GatewayProbeClose | null;
  verifiedRead?: boolean;
  connectLatencyMs?: number | null;
}): GatewayProbeAuthSummary {
  const scopes = Array.isArray(params.scopes) ? params.scopes : [];
  return {
    role: params.role ?? null,
    scopes,
    capability: resolveGatewayProbeCapability({
      auth: { scopes },
      authMetadataPresent: params.authMetadataPresent,
      error: params.error,
      close: params.close,
      verifiedRead: params.verifiedRead,
      connectLatencyMs: params.connectLatencyMs,
    }),
  };
}

// ==================== 探测主逻辑 ====================

/**
 * 探测 Gateway 连接
 *
 * 执行步骤：
 * 1. 解析 URL 并验证安全性（ws:// 仅允许本地/私有端点）
 * 2. 向 /health 端点发起 HTTP 请求，测量连接延迟
 * 3. 解析服务端版本，检查兼容性
 * 4. 如携带凭据，尝试已认证端点验证认证状态
 * 5. 汇总探测结果
 *
 * @param opts.url Gateway URL（HTTP 或 WebSocket 均可）
 * @param opts.auth 认证凭据（可选）
 * @param opts.timeoutMs 探测超时（默认 5 秒）
 * @param opts.signal 中断信号（可选）
 */
export async function probeGateway(opts: {
  url: string;
  auth?: GatewayProbeAuth;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}): Promise<GatewayProbeResult> {
  const startedAt = Date.now();
  const timeoutMs = clampProbeTimeoutMs(opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
  const baseUrl = resolveHttpBaseUrl(opts.url);

  let connectLatencyMs: number | null = null;
  let close: GatewayProbeClose | null = null;
  let auth = emptyProbeAuth();
  let server = emptyProbeServer();
  let health: unknown = null;
  let versionCompatible = true;
  let authMetadataPresent = false;

  // 验证 WebSocket URL 安全性（若传入 ws:// URL）
  if (opts.url.startsWith("ws://") || opts.url.startsWith("wss://")) {
    if (!isSecureWebSocketUrl(opts.url)) {
      return {
        ok: false,
        status: "unreachable",
        url: opts.url,
        connectLatencyMs: null,
        error: "insecure WebSocket URL: ws:// to non-local host rejected",
        close: null,
        auth,
        server,
        health: null,
        versionCompatible: false,
      };
    }
  }

  // 合并外部 signal 和内部超时 signal
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  // 如有外部 signal，转发中断
  const externalAbort = (): void => {
    timeoutController.abort();
  };
  if (opts.signal) {
    if (opts.signal.aborted) {
      clearTimeout(timer);
      return {
        ok: false,
        status: "timeout",
        url: opts.url,
        connectLatencyMs: null,
        error: "aborted before probe started",
        close: null,
        auth,
        server,
        health: null,
        versionCompatible: false,
      };
    }
    opts.signal.addEventListener("abort", externalAbort, { once: true });
  }

  try {
    // 步骤 1：探测 /health 端点（可达性 + 延迟）
    const healthResponse = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: timeoutController.signal,
      headers: buildProbeHeaders(opts.auth),
    });

    connectLatencyMs = Date.now() - startedAt;

    if (!healthResponse.ok) {
      close = {
        code: healthResponse.status,
        reason: `health check failed: ${healthResponse.statusText}`,
      };
      return {
        ok: false,
        status: healthResponse.status === 401 ? "auth_required" : "unreachable",
        url: opts.url,
        connectLatencyMs,
        error: formatProbeCloseError(close),
        close,
        auth,
        server,
        health: null,
        versionCompatible: false,
      };
    }

    // 解析 health 响应
    try {
      health = await healthResponse.json();
    } catch {
      health = null;
    }

    // 提取服务端版本
    const healthObj = health as Record<string, unknown> | null;
    const serverVersion =
      typeof healthObj?.version === "string" ? healthObj.version : null;
    server = {
      version: serverVersion,
      connId: typeof healthObj?.timestamp === "string" ? healthObj.timestamp : null,
    };
    versionCompatible = isVersionCompatible(serverVersion);

    if (!versionCompatible) {
      close = {
        code: 1011,
        reason: `version mismatch: server ${serverVersion ?? "unknown"} < required ${MIN_SERVER_VERSION}`,
      };
      return {
        ok: false,
        status: "version_mismatch",
        url: opts.url,
        connectLatencyMs,
        error: formatProbeCloseError(close),
        close,
        auth,
        server,
        health,
        versionCompatible: false,
      };
    }

    // 步骤 2：如携带凭据，验证认证状态
    if (hasProbeAuth(opts.auth)) {
      const authResult = await probeAuth(baseUrl, opts.auth!, timeoutController.signal);
      authMetadataPresent = authResult.authenticated;
      auth = resolveProbeAuthSummary({
        role: authResult.authenticated ? "operator" : null,
        scopes: authResult.scopes,
        authMetadataPresent,
        verifiedRead: authResult.authenticated,
        connectLatencyMs,
      });
    } else {
      // 无凭据但连接成功
      auth = resolveProbeAuthSummary({
        authMetadataPresent: true,
        connectLatencyMs,
      });
    }

    const ok = true;
    const status: GatewayProbeStatus = hasProbeAuth(opts.auth)
      ? auth.capability === "auth_failed"
        ? "auth_required"
        : "reachable"
      : "reachable";

    return {
      ok,
      status,
      url: opts.url,
      connectLatencyMs,
      error: null,
      close: null,
      auth,
      server,
      health,
      versionCompatible,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");

    close = {
      code: isTimeout ? 1006 : 1011,
      reason: isTimeout ? "probe timeout" : "connect failed",
    };

    logger.debug(`[GatewayProbe] 探测失败: ${error}`);

    return {
      ok: false,
      status: isTimeout ? "timeout" : "unreachable",
      url: opts.url,
      connectLatencyMs,
      error: isTimeout ? `probe timeout after ${timeoutMs}ms` : `connect failed: ${error}`,
      close,
      auth: resolveProbeAuthSummary({
        error,
        close,
        connectLatencyMs,
      }),
      server,
      health: null,
      versionCompatible: false,
    };
  } finally {
    clearTimeout(timer);
    if (opts.signal) {
      opts.signal.removeEventListener("abort", externalAbort);
    }
  }
}

// ==================== 认证探测辅助 ====================

/** 构建探测请求头（含认证） */
function buildProbeHeaders(auth: GatewayProbeAuth | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  } else if (auth?.password) {
    headers.Authorization = `Bearer ${auth.password}`;
  }
  return headers;
}

/** 探测认证端点，验证凭据有效性 */
async function probeAuth(
  baseUrl: string,
  auth: GatewayProbeAuth,
  signal: AbortSignal,
): Promise<{ authenticated: boolean; scopes: string[] }> {
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      signal,
      headers: buildProbeHeaders(auth),
    });

    if (response.status === 401 || response.status === 403) {
      return { authenticated: false, scopes: [] };
    }
    if (!response.ok) {
      return { authenticated: false, scopes: [] };
    }

    // 认证成功：根据凭据类型推断基础 scope
    const scopes: string[] = ["operator.read"];
    if (auth.token) {
      scopes.push("operator.write");
    }

    return { authenticated: true, scopes };
  } catch {
    return { authenticated: false, scopes: [] };
  }
}

// ==================== 探测结果工具函数 ====================

/** 判断探测结果是否为配对待定（适配 openclaw 概念） */
export function isAuthRequiredProbeFailure(params: {
  error?: string | null;
  close?: GatewayProbeClose | null;
}): boolean {
  return /auth|unauthorized|forbidden|pairing/i.test(
    params.close?.reason ?? params.error ?? "",
  );
}

/** 格式化探测结果为可读字符串 */
export function formatProbeResult(result: GatewayProbeResult): string {
  const lines: string[] = [
    `Gateway Probe Result`,
    `  URL: ${result.url}`,
    `  Status: ${result.status}`,
    `  OK: ${result.ok}`,
    `  Latency: ${result.connectLatencyMs ?? "N/A"}ms`,
  ];
  if (result.error) {
    lines.push(`  Error: ${result.error}`);
  }
  if (result.server.version) {
    lines.push(`  Server Version: ${result.server.version}`);
  }
  lines.push(`  Auth Capability: ${result.auth.capability}`);
  if (result.auth.scopes.length > 0) {
    lines.push(`  Auth Scopes: ${result.auth.scopes.join(", ")}`);
  }
  lines.push(`  Version Compatible: ${result.versionCompatible}`);
  return lines.join("\n");
}
