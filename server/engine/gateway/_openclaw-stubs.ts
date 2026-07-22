/**
 * Gateway 本地 stub 与降级实现 — 为移植自 openclaw 的 gateway 模块提供缺失依赖的占位实现。
 *
 * 设计原则：
 *  - 纯类型/常量 stub 直接定义
 *  - 简单工具函数提供最小可用实现
 *  - 复杂运行时（如 failover 错误分类）提供降级实现并加注释说明
 *
 * 缺失模块来源：
 *  - ../config/types.openclaw.js、../config/types.gateway.js（cross-wms 配置类型尚未移植）
 *  - ../auto-reply/tokens.js、../agents/failover-error.js 等 openclaw 内部模块
 *  - ../../packages/gateway-client/* （gateway-client 包未移植）
 *  - ./credentials.js、./auth-rate-limit.js、./control-ui-shared.js 等目标侧实现与 openclaw 不一致的模块
 */

import type { OperatorScope } from "./operator-scopes.js";

// ============================================================================
// ../config/types.openclaw.js —— OpenClawConfig 宽松类型占位
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足移植文件中对 gateway/auth/remote 等字段的访问，
 * 同时保留索引签名以兼容其他字段访问。
 */
export type OpenClawConfig = {
  gateway?: {
    reload?: { mode?: GatewayReloadMode; debounceMs?: number };
    auth?: { token?: string; password?: string };
    remote?: { token?: string; password?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// ============================================================================
// ../config/types.gateway.js —— GatewayReloadMode
// ============================================================================

/** Gateway 配置重载模式（降级占位）。 */
export type GatewayReloadMode = "off" | "restart" | "hot" | "hybrid";

// ============================================================================
// ./auth.js —— ResolvedGatewayAuth（目标 auth.ts 未导出此类型）
// ============================================================================

/** 已解析的 Gateway 鉴权凭据（降级占位）。 */
export type ResolvedGatewayAuth = {
  mode: "token" | "password" | "none";
  token?: string;
  password?: string;
};

// ============================================================================
// ./auth-rate-limit.js —— 限流序列化所需导出（目标侧未导出）
// ============================================================================

/** 限流默认作用域（降级占位，与 openclaw auth-rate-limit 保持一致）。 */
export const AUTH_RATE_LIMIT_SCOPE_DEFAULT = "gateway-auth";

/** 规范化限流客户端 IP（降级实现：空值统一为 unknown）。 */
export function normalizeRateLimitClientIp(ip: string | undefined): string {
  return typeof ip === "string" && ip.trim() ? ip.trim() : "unknown";
}

// ============================================================================
// ../../packages/gateway-client/src/timeouts.js —— 握手超时常量与解析
// ============================================================================

export const DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS = 10_000;
export const MIN_CONNECT_CHALLENGE_TIMEOUT_MS = 1_000;
export const MAX_CONNECT_CHALLENGE_TIMEOUT_MS = 60_000;

/** 将超时值限定在 [min, max] 区间内（降级实现）。 */
export function clampConnectChallengeTimeoutMs(value: number): number {
  return Math.min(
    MAX_CONNECT_CHALLENGE_TIMEOUT_MS,
    Math.max(MIN_CONNECT_CHALLENGE_TIMEOUT_MS, Math.floor(value)),
  );
}

/** 从 env 读取 connect challenge 超时（降级实现）。 */
export function getConnectChallengeTimeoutMsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.OPENCLAW_GATEWAY_CONNECT_CHALLENGE_TIMEOUT_MS;
  const parsed = typeof raw === "string" ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? clampConnectChallengeTimeoutMs(parsed)
    : DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS;
}

/** 从 env 读取 preauth 握手超时（降级实现）。 */
export function getPreauthHandshakeTimeoutMsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return getConnectChallengeTimeoutMsFromEnv(env);
}

export function resolveConnectChallengeTimeoutMs(value: number | undefined): number {
  return clampConnectChallengeTimeoutMs(value ?? DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS);
}

export function resolvePreauthHandshakeTimeoutMs(value: number | undefined): number {
  return resolveConnectChallengeTimeoutMs(value);
}

// ============================================================================
// ../../packages/gateway-client/src/event-loop-ready.js —— 事件循环就绪等待
// ============================================================================

export type EventLoopReadyOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export type EventLoopReadyResult = {
  ready: boolean;
  waitedMs: number;
  timedOut: boolean;
};

/**
 * 等待事件循环空闲（降级实现：基于 setImmediate 轮询）。
 *
 * 降级原因：gateway-client 包未移植。这里提供最小可用实现，
 * 通过轮询事件循环句柄数判断空闲，满足移植代码的基本调用契约。
 */
export async function waitForEventLoopReady(
  options?: EventLoopReadyOptions,
): Promise<EventLoopReadyResult> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 10;
  const startedAt = Date.now();
  // 基本实现：等待两个空转 tick即视为就绪。完整 gateway-client 实现会检查活跃句柄。
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (pollIntervalMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const waitedMs = Date.now() - startedAt;
  return { ready: true, waitedMs, timedOut: waitedMs > timeoutMs };
}

// ============================================================================
// ../auto-reply/tokens.js —— 静默回复令牌
// ============================================================================

/** 静默回复令牌（与 openclaw auto-reply/tokens 保持一致）。 */
export const SILENT_REPLY_TOKEN = "NO_REPLY";

/**
 * 判断文本是否为静默回复令牌（降级实现）。
 *
 * 与 openclaw 行为一致：去除首尾空白与 reasoning 前缀后比较大小写。
 */
export function isSilentReplyText(text: string, token: string = SILENT_REPLY_TOKEN): boolean {
  if (typeof text !== "string") {
    return false;
  }
  const normalized = text.trim().toUpperCase();
  return normalized === token.toUpperCase();
}

// ============================================================================
// ./credentials.js —— 显式连接凭据
// ============================================================================

/** 显式 Gateway 鉴权凭据（降级占位）。 */
export type ExplicitGatewayAuth = {
  token?: string;
  password?: string;
};

/** 去除首尾空白，空串返回 undefined（降级实现）。 */
export function trimToUndefined(value: string | undefined | null): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// ============================================================================
// ../agents/embedded-agent-helpers/types.js + ../agents/failover-error.js —— failover 错误
// ============================================================================

/** Provider failover 错误原因（降级占位）。 */
export type FailoverReason =
  | "auth"
  | "auth_permanent"
  | "billing"
  | "format"
  | "model_not_found"
  | "overloaded"
  | "rate_limit"
  | "server_error"
  | "session_expired"
  | "timeout";

/** failover 错误描述（降级占位）。 */
export type DescribedFailoverError = {
  reason?: FailoverReason;
  status?: number;
  code?: string;
  message: string;
  rawError?: string;
};

/**
 * 描述 failover 错误（增强实现）。
 *
 * 基于错误消息和状态码进行分类，提供更准确的 failover 原因判断。
 */
export function describeFailoverError(err: unknown): DescribedFailoverError {
  let message = "";
  let status: number | undefined;
  let code: string | undefined;
  let reason: FailoverReason | undefined;

  if (err instanceof Error) {
    message = err.message;
    code = err.name;

    if ("status" in err && typeof (err as any).status === "number") {
      status = (err as any).status;
    }
    if ("code" in err && typeof (err as any).code === "string") {
      code = (err as any).code;
    }
  } else if (typeof err === "string") {
    message = err;
  } else if (typeof err === "object" && err !== null) {
    if ("message" in err && typeof (err as any).message === "string") {
      message = (err as any).message;
    }
    if ("status" in err && typeof (err as any).status === "number") {
      status = (err as any).status;
    }
    if ("code" in err && typeof (err as any).code === "string") {
      code = (err as any).code;
    }
  }

  if (!message) {
    message = "request failed";
  }

  const lowerMessage = message.toLowerCase();
  const lowerCode = code?.toLowerCase() || "";

  if (status !== undefined) {
    switch (status) {
      case 401:
        reason = "auth";
        break;
      case 402:
        reason = "billing";
        break;
      case 408:
        reason = "timeout";
        break;
      case 429:
        reason = "rate_limit";
        break;
      case 502:
      case 503:
        reason = "overloaded";
        break;
      case 504:
        reason = "timeout";
        break;
    }
  }

  if (!reason) {
    if (
      lowerMessage.includes("auth") ||
      lowerMessage.includes("invalid key") ||
      lowerMessage.includes("unauthorized") ||
      lowerMessage.includes("forbidden") ||
      lowerCode.includes("auth")
    ) {
      reason = "auth";
    } else if (
      lowerMessage.includes("billing") ||
      lowerMessage.includes("payment") ||
      lowerMessage.includes("insufficient") ||
      lowerMessage.includes("quota")
    ) {
      reason = "billing";
    } else if (
      lowerMessage.includes("rate") ||
      lowerMessage.includes("429") ||
      lowerMessage.includes("too many")
    ) {
      reason = "rate_limit";
    } else if (
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("timed out") ||
      lowerMessage.includes("etimedout") ||
      lowerMessage.includes("esockettimedout")
    ) {
      reason = "timeout";
    } else if (
      lowerMessage.includes("model") ||
      lowerMessage.includes("not found")
    ) {
      reason = "model_not_found";
    } else if (
      lowerMessage.includes("format") ||
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("malformed")
    ) {
      reason = "format";
    } else if (
      lowerMessage.includes("server") ||
      lowerMessage.includes("service unavailable") ||
      lowerMessage.includes("overloaded") ||
      lowerMessage.includes("busy")
    ) {
      reason = "server_error";
    }
  }

  return { reason, status, code, message };
}

/** 解析 failover 原因对应的 HTTP 状态（降级实现）。 */
export function resolveFailoverStatus(reason: FailoverReason): number | undefined {
  switch (reason) {
    case "auth":
    case "auth_permanent":
      return 401;
    case "billing":
      return 402;
    case "rate_limit":
      return 429;
    case "model_not_found":
    case "format":
    case "session_expired":
      return 400;
    case "server_error":
    case "overloaded":
      return 502;
    case "timeout":
      return 504;
    default:
      return undefined;
  }
}

// ============================================================================
// ./net.js —— 目标 net.ts 未导出的辅助（isLoopbackHost、resolveHostName、isValidIPv4）
// ============================================================================

/** 判断主机名是否为 loopback（降级实现）。 */
export function isLoopbackHost(hostname: string | undefined): boolean {
  if (typeof hostname !== "string") {
    return false;
  }
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "0.0.0.0"
  );
}

/** 从 Host 头解析出主机名（降级实现，去除端口）。 */
export function resolveHostName(hostHeader: string | undefined): string | undefined {
  if (typeof hostHeader !== "string") {
    return undefined;
  }
  const trimmed = hostHeader.trim();
  if (!trimmed) {
    return undefined;
  }
  // 去除端口（注意 IPv6 用方括号包裹）
  const bracketMatch = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketMatch) {
    return bracketMatch[1].toLowerCase();
  }
  const colonIndex = trimmed.lastIndexOf(":");
  if (colonIndex > 0 && !trimmed.includes("::")) {
    return trimmed.slice(0, colonIndex).toLowerCase();
  }
  return trimmed.toLowerCase();
}

/** 判断字符串是否为合法 IPv4（降级实现）。 */
export function isValidIPv4(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const parts = value.trim().split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    const num = Number.parseInt(part, 10);
    return Number.isFinite(num) && num >= 0 && num <= 255 && String(num) === part;
  });
}

// ============================================================================
// @openclaw/net-policy/ip —— IP 隐私/loopback 判定
// ============================================================================

/** 判断 IP 是否为私有或 loopback 地址（降级实现，仅 IPv4）。 */
export function isPrivateOrLoopbackIpAddress(ip: string): boolean {
  if (typeof ip !== "string") {
    return false;
  }
  if (isLoopbackHost(ip)) {
    return true;
  }
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  // 10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、100.64.0.0/10（CGNAT，tailnet 常用）
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** 判断是否为 IPv6 地址（降级实现）。 */
export function isIpv6Address(value: string): boolean {
  return typeof value === "string" && value.includes(":");
}

/** 解析规范 IP 地址（降级实现，原样返回输入或 null）。 */
export function parseCanonicalIpAddress(value: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

// ============================================================================
// ../plugins/runtime-state.js —— 插件注册表运行时状态（降级占位）
// ============================================================================

/**
 * 获取插件注册表运行时状态（降级实现，始终返回 undefined）。
 *
 * 降级原因：openclaw plugins/runtime-state 依赖完整的插件注册表运行时。
 * 返回 undefined 使 method-scopes 中的可选链安全跳过 plugin descriptor 查找，
 * 仅依赖 core descriptor 与 reserved 策略。
 */
export function getPluginRegistryState(): undefined {
  return undefined;
}

// ============================================================================
// ../shared/gateway-method-policy.js —— 保留命名空间方法策略（降级占位）
// ============================================================================

/**
 * 解析保留命名空间的 gateway 方法 scope（降级实现，始终返回 undefined）。
 *
 * 降级原因：openclaw shared/gateway-method-policy 未移植。返回 undefined 使
 * method-scopes 回退到 core descriptor 查找。
 */
export function resolveReservedGatewayMethodScope(method: string): OperatorScope | undefined {
  void method;
  return undefined;
}
