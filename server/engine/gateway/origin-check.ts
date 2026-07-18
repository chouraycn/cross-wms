// Gateway HTTP 与 websocket 请求的浏览器 Origin 校验器。
// 移植自 openclaw/src/gateway/origin-check.ts。
// 依赖调整：
//  - @openclaw/net-policy/ip 的 isPrivateOrLoopbackIpAddress → 本地 _openclaw-stubs.ts
//  - @openclaw/normalization-core/string-coerce → ../infra/string-coerce.js
//  - ./net.js 的 normalizeHostHeader（目标已存在）；isLoopbackHost、resolveHostName → 本地 _openclaw-stubs.ts
import net from "node:net";
import { isPrivateOrLoopbackIpAddress } from "./_openclaw-stubs.js";
import { isLoopbackHost, resolveHostName } from "./_openclaw-stubs.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "../infra/string-coerce.js";
import { normalizeHostHeader } from "./net.js";

type OriginCheckResult =
  | {
      ok: true;
      matchedBy: "allowlist" | "host-header-fallback" | "private-same-origin" | "local-loopback";
    }
  | { ok: false; reason: string };

function parseOrigin(
  originRaw?: string,
): { origin: string; host: string; hostname: string } | null {
  const trimmed = (originRaw ?? "").trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return {
      origin: normalizeLowercaseStringOrEmpty(url.origin),
      host: normalizeLowercaseStringOrEmpty(url.host),
      hostname: normalizeLowercaseStringOrEmpty(url.hostname),
    };
  } catch {
    return null;
  }
}

/** 针对显式 allowlist、同主机和本地 dev 规则校验浏览器 Origin。 */
export function checkBrowserOrigin(params: {
  requestHost?: string;
  origin?: string;
  allowedOrigins?: string[];
  allowHostHeaderOriginFallback?: boolean;
  isLocalClient?: boolean;
}): OriginCheckResult {
  const parsedOrigin = parseOrigin(params.origin);
  if (!parsedOrigin) {
    return { ok: false, reason: "origin missing or invalid" };
  }

  const allowlist = new Set(
    (params.allowedOrigins ?? [])
      .map((value) => normalizeOptionalLowercaseString(value))
      .filter(Boolean),
  );
  if (allowlist.has("*") || allowlist.has(parsedOrigin.origin)) {
    return { ok: true, matchedBy: "allowlist" };
  }

  const requestHost = normalizeHostHeader(params.requestHost ?? "");
  if (
    params.allowHostHeaderOriginFallback === true &&
    requestHost &&
    parsedOrigin.host === requestHost
  ) {
    return { ok: true, matchedBy: "host-header-fallback" };
  }
  if (
    requestHost &&
    parsedOrigin.host === requestHost &&
    isTrustedSameOriginHost(requestHost, params.isLocalClient)
  ) {
    return { ok: true, matchedBy: "private-same-origin" };
  }

  // 仅对真正本地 socket 客户端的 dev fallback，不针对 Host 头声明。
  if (params.isLocalClient && isLoopbackHost(parsedOrigin.hostname)) {
    return { ok: true, matchedBy: "local-loopback" };
  }

  return { ok: false, reason: "origin not allowed" };
}

function isTrustedSameOriginHost(hostHeader: string, isLocalClient?: boolean): boolean {
  const hostname = resolveHostName(hostHeader);
  if (!hostname) {
    return false;
  }
  if (isLoopbackHost(hostname)) {
    return isLocalClient !== false;
  }
  if (net.isIP(hostname) !== 0) {
    return isPrivateOrLoopbackIpAddress(hostname);
  }
  return hostname.endsWith(".local") || hostname.endsWith(".ts.net");
}
