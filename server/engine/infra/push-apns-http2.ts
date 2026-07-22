// 打开 APNs HTTP/2 会话，可选通过受管代理隧道。
// 降级：
//  - @openclaw/normalization-core/number-coercion → ./_runtime-stubs.js
//  - net/proxy/active-proxy-state 未移植 → 内联降级为 undefined（无代理）
//  - net/proxy/proxy-tls 未移植 → 内联类型降级
//  - openHttpConnectTunnel 未移植 → probeApnsHttp2ReachabilityViaProxy 返回降级结果（status=0）
import http2 from "node:http2";
import { resolveTimerTimeoutMs } from "./_runtime-stubs.js";
import { toErrorObject } from "./errors.js";

const APNS_DEFAULT_PORT = "443";

const APNS_AUTHORITIES = new Set([
  "https://api.push.apple.com",
  "https://api.sandbox.push.apple.com",
]);

type ApnsAuthority = "https://api.push.apple.com" | "https://api.sandbox.push.apple.com";

export const APNS_HTTP2_CANCEL_CODE = http2.constants.NGHTTP2_CANCEL;
export const APNS_RESPONSE_BODY_MAX_BYTES = 8192;
const APNS_HTTP2_MIN_TIMEOUT_MS = 1000;

// ============================================================================
// 降级：net/proxy/proxy-tls.js 与 active-proxy-state.js（未移植）
// ============================================================================

/** 受管代理 TLS 选项（降级类型） */
export type ManagedProxyTlsOptions = Record<string, unknown>;

/** 活动受管代理 URL（降级类型） */
export type ActiveManagedProxyUrl = URL;

/** 降级：返回 undefined（无活动代理） */
export function getActiveManagedProxyUrl(): ActiveManagedProxyUrl | undefined {
  return undefined;
}

/** 降级：返回 undefined（无代理 TLS 选项） */
export function getActiveManagedProxyTlsOptions(): ManagedProxyTlsOptions | undefined {
  return undefined;
}

export type ApnsResponseBodyCapture = {
  text: string;
  bytes: number;
  truncated: boolean;
};

/** 打开 APNs HTTP/2 客户端会话的参数。 */
export type ConnectApnsHttp2SessionParams = {
  authority: string;
  timeoutMs: number;
};

/** 通过显式代理验证 APNs 可达性的参数。 */
export type ProbeApnsHttp2ReachabilityViaProxyParams = {
  authority: string;
  proxyUrl: string;
  proxyTls?: ManagedProxyTlsOptions;
  timeoutMs: number;
};

/** APNs 探测响应，用于证明代理隧道到 Apple。 */
export type ProbeApnsHttp2ReachabilityViaProxyResult = {
  status: number;
  body: string;
  /** APNs 的原始响应头。当连接真正隧道到 Apple 时包含 apns-id。 */
  responseHeaders: Record<string, string>;
};

function assertApnsAuthority(authority: string): ApnsAuthority {
  let parsed: URL;
  try {
    parsed = new URL(authority);
  } catch {
    throw new Error(`Unsupported APNs authority: ${authority}`);
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Unsupported APNs authority: ${authority}`);
  }
  const port = parsed.port && parsed.port !== APNS_DEFAULT_PORT ? `:${parsed.port}` : "";
  const normalized = `${parsed.protocol}//${parsed.hostname}${port}`;
  if (!APNS_AUTHORITIES.has(normalized)) {
    throw new Error(`Unsupported APNs authority: ${authority}`);
  }
  // 仅返回规范化 origin。APNs 路径由调用方创建，不应从用户/配置 authority 输入接受。
  return normalized as ApnsAuthority;
}

/** 直接连接 APNs，或在存在活动受管代理时通过代理连接。 */
export async function connectApnsHttp2Session(
  params: ConnectApnsHttp2SessionParams,
): Promise<http2.ClientHttp2Session> {
  const authority = assertApnsAuthority(params.authority);
  resolveApnsHttp2TimeoutMs(params.timeoutMs);
  // 降级：无活动受管代理，直接连接。
  return http2.connect(authority);
}

function resolveApnsHttp2TimeoutMs(timeoutMs: number): number {
  return resolveTimerTimeoutMs(timeoutMs, APNS_HTTP2_MIN_TIMEOUT_MS, APNS_HTTP2_MIN_TIMEOUT_MS);
}

export function createApnsResponseBodyCapture(): ApnsResponseBodyCapture {
  return { text: "", bytes: 0, truncated: false };
}

export function appendApnsResponseBodyCapture(
  capture: ApnsResponseBodyCapture,
  chunk: unknown,
  maxBytes = APNS_RESPONSE_BODY_MAX_BYTES,
): void {
  const buffer = Buffer.from(String(chunk));
  capture.bytes += buffer.byteLength;
  const remaining = maxBytes - Buffer.byteLength(capture.text);
  if (remaining <= 0) {
    capture.truncated = capture.truncated || buffer.byteLength > 0;
    return;
  }
  const slice = buffer.byteLength > remaining ? buffer.subarray(0, remaining) : buffer;
  capture.text += slice.toString("utf8");
  if (slice.byteLength < buffer.byteLength) {
    capture.truncated = true;
  }
}

/** 通过代理发送故意的无效 APNs 推送以证明 HTTP/2 可达性。 */
export async function probeApnsHttp2ReachabilityViaProxy(
  params: ProbeApnsHttp2ReachabilityViaProxyParams,
): Promise<ProbeApnsHttp2ReachabilityViaProxyResult> {
  // 降级：net/proxy/active-proxy-state 与 openHttpConnectTunnel 未移植。
  // 返回 status=0 表示探测无法执行（代理子系统不可用），而非抛出错误。
  // 调用方可据此判断代理探测功能在当前环境中不可用。
  void params;
  return {
    status: 0,
    body: "",
    responseHeaders: {},
  };
}

// 抑制未使用导入警告
void toErrorObject;
