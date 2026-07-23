// Gateway HTTP 鉴权辅助。
// 移植自 openclaw/src/gateway/http-auth-utils.ts
//
// 适配说明：
//  - @openclaw/normalization-core/string-coerce → ../infra/string-coerce.js（已移植）
//  - ../config/io.js（getRuntimeConfig）→ 降级为返回空配置对象
//  - ../config/types.openclaw.js（OpenClawConfig）→ 使用 Record<string, unknown> 宽松类型
//  - ./auth.js（authorizeHttpGatewayConnect）→ cross-wms 已移植，签名更简单
//    （不含 browserOriginPolicy、connectAuth、rateLimiter 参数），适配调用
//  - ./http-common.js（sendGatewayAuthFailure、sendMissingScopeForbidden）→
//    cross-wms http-common 未导出这两个函数，使用 sendJsonResponse 本地实现
//  - ./method-scopes.js（ADMIN_SCOPE、CLI_DEFAULT_OPERATOR_SCOPES、authorizeOperatorScopesForMethod）→ 已移植
//  - ./auth-rate-limit.js（AuthRateLimiter）→ 降级为宽松类型，不参与鉴权逻辑

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../infra/string-coerce.js";
import type { ResolvedGatewayAuth } from "./auth-resolve.js";
import {
  authorizeHttpGatewayConnect,
  type GatewayAuthResult,
} from "./auth.js";
import { sendJsonResponse } from "./http-common.js";
import {
  ADMIN_SCOPE,
  CLI_DEFAULT_OPERATOR_SCOPES,
  authorizeOperatorScopesForMethod,
} from "./method-scopes.js";

/** AuthRateLimiter 宽松类型（cross-wms auth-rate-limit 为降级占位）。 */
export type AuthRateLimiter = {
  check?: (...args: unknown[]) => { allowed: boolean };
  recordFailure?: (...args: unknown[]) => void;
};

/** 从 IncomingMessage headers 中按名称获取头部值。 */
export function getHeader(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[normalizeLowercaseStringOrEmpty(name)];
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return undefined;
}

/** 从 Authorization 头提取 Bearer token。 */
export function getBearerToken(req: IncomingMessage): string | undefined {
  // Bearer 解析刻意保持最小化：调用方将提取的 token 传入共享 gateway 鉴权
  // 验证器进行常量时间比较。
  const raw = normalizeOptionalString(getHeader(req, "authorization")) ?? "";
  if (!normalizeLowercaseStringOrEmpty(raw).startsWith("bearer ")) {
    return undefined;
  }
  return normalizeOptionalString(raw.slice(7));
}

type SharedSecretGatewayAuth = Pick<ResolvedGatewayAuth, "mode">;

export type AuthorizedGatewayHttpRequest = {
  authMethod?: GatewayAuthResult["method"];
  trustDeclaredOperatorScopes: boolean;
};

export type GatewayHttpRequestAuthCheckResult =
  | {
      ok: true;
      requestAuth: AuthorizedGatewayHttpRequest;
    }
  | {
      ok: false;
      authResult: GatewayAuthResult;
    };

/** 解析 HTTP 浏览器来源策略（降级实现：仅返回 host/origin 头信息）。 */
export function resolveHttpBrowserOriginPolicy(
  req: IncomingMessage,
  cfg?: Record<string, unknown>,
): {
  requestHost: string | undefined;
  origin: string | undefined;
  allowedOrigins: unknown;
  allowHostHeaderOriginFallback: boolean;
} {
  const gatewayConfig = (cfg as { gateway?: { controlUi?: Record<string, unknown> } } | undefined)?.gateway;
  return {
    requestHost: getHeader(req, "host"),
    origin: getHeader(req, "origin"),
    allowedOrigins: gatewayConfig?.controlUi?.allowedOrigins,
    allowHostHeaderOriginFallback:
      gatewayConfig?.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true,
  };
}

function usesSharedSecretHttpAuth(auth: SharedSecretGatewayAuth | undefined): boolean {
  return auth?.mode === "token" || auth?.mode === "password";
}

function usesSharedSecretGatewayMethod(method: GatewayAuthResult["method"] | undefined): boolean {
  return method === "token" || method === "password";
}

function shouldTrustDeclaredHttpOperatorScopes(
  req: IncomingMessage,
  authOrRequest:
    | SharedSecretGatewayAuth
    | Pick<AuthorizedGatewayHttpRequest, "trustDeclaredOperatorScopes">
    | undefined,
): boolean {
  if (authOrRequest && "trustDeclaredOperatorScopes" in authOrRequest) {
    return authOrRequest.trustDeclaredOperatorScopes;
  }
  return !isGatewayBearerHttpRequest(req, authOrRequest);
}

/** 发送 gateway 鉴权失败响应（本地实现，替代 openclaw http-common 的 sendGatewayAuthFailure）。 */
function sendGatewayAuthFailure(res: ServerResponse, authResult: GatewayAuthResult): void {
  const status = authResult.rateLimited ? 429 : 401;
  sendJsonResponse(res as unknown as { statusCode?: number; setHeader?: (n: string, v: string) => void; end?: (b?: string) => void; json?: (b: unknown) => void }, status, {
    error: authResult.reason ?? "unauthorized",
    method: authResult.method,
    ...(authResult.retryAfterMs ? { retryAfterMs: authResult.retryAfterMs } : {}),
  });
}

/** 发送缺失 scope 的 403 禁止响应（本地实现，替代 openclaw http-common 的 sendMissingScopeForbidden）。 */
function sendMissingScopeForbidden(res: ServerResponse, missingScope: string): void {
  sendJsonResponse(res as unknown as { statusCode?: number; setHeader?: (n: string, v: string) => void; end?: (b?: string) => void; json?: (b: unknown) => void }, 403, {
    error: `missing required scope: ${missingScope}`,
    missingScope,
  });
}

/** 鉴权 HTTP 请求或在失败时回复鉴权错误。 */
export async function authorizeGatewayHttpRequestOrReply(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
}): Promise<AuthorizedGatewayHttpRequest | null> {
  const result = await checkGatewayHttpRequestAuth(params);
  if (!result.ok) {
    sendGatewayAuthFailure(params.res, result.authResult);
    return null;
  }
  return result.requestAuth;
}

/** 检查 HTTP 请求鉴权（不回复错误，返回检查结果）。 */
export async function checkGatewayHttpRequestAuth(params: {
  req: IncomingMessage;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
  cfg?: Record<string, unknown>;
}): Promise<GatewayHttpRequestAuthCheckResult> {
  const token = getBearerToken(params.req);
  // 适配 cross-wms auth.ts：authorizeHttpGatewayConnect 接受 (auth, req, trustedProxies?, clientIp?)
  // openclaw 版本接受 browserOriginPolicy、connectAuth、rateLimiter 等更多参数，此处降级。
  const authResult = authorizeHttpGatewayConnect(
    {
      mode: params.auth.mode,
      token: params.auth.token,
      password: params.auth.password,
      trustedProxies: params.trustedProxies ?? params.auth.trustedProxy?.proxies,
    },
    params.req as unknown as { headers: Record<string, string | string[] | undefined>; remoteAddr?: string },
    params.trustedProxies,
    // allowRealIpFallback 在 cross-wms auth.ts 中不支持，忽略
  );
  if (!authResult.ok) {
    return {
      ok: false,
      authResult,
    };
  }
  void token; // token 已在 authorizeHttpGatewayConnect 内部通过 req.headers 解析
  return {
    ok: true,
    requestAuth: {
      authMethod: authResult.method,
      // Shared-secret bearer 鉴权证明持有 gateway secret，但不证明更窄的
      // per-request operator 身份。HTTP 端点必须显式 opt-in 才能将该
      // shared-secret 路径视为完整的 trusted-operator surface。
      trustDeclaredOperatorScopes: !usesSharedSecretGatewayMethod(authResult.method),
    },
  };
}

/** 鉴权带 scope 检查的 HTTP 请求或在失败时回复错误。 */
export async function authorizeScopedGatewayHttpRequestOrReply(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
  operatorMethod: string;
  resolveOperatorScopes: (
    req: IncomingMessage,
    requestAuth: AuthorizedGatewayHttpRequest,
  ) => string[];
}): Promise<{
  cfg: Record<string, unknown>;
  requestAuth: AuthorizedGatewayHttpRequest;
  operatorScopes: string[];
} | null> {
  // 降级：openclaw 使用 getRuntimeConfig()，cross-wms 返回空配置对象。
  const cfg: Record<string, unknown> = {};
  const requestAuth = await authorizeGatewayHttpRequestOrReply({
    req: params.req,
    res: params.res,
    auth: params.auth,
    trustedProxies: params.trustedProxies,
    allowRealIpFallback: params.allowRealIpFallback,
    rateLimiter: params.rateLimiter,
  });
  if (!requestAuth) {
    return null;
  }

  const operatorScopes = params.resolveOperatorScopes(params.req, requestAuth);
  const scopeAuth = authorizeOperatorScopesForMethod(params.operatorMethod, operatorScopes);
  if (!scopeAuth.allowed) {
    sendMissingScopeForbidden(params.res, scopeAuth.missingScope);
    return null;
  }

  return { cfg, requestAuth, operatorScopes };
}

/** 判断请求是否使用 gateway bearer 鉴权。 */
export function isGatewayBearerHttpRequest(
  req: IncomingMessage,
  auth?: SharedSecretGatewayAuth,
): boolean {
  return usesSharedSecretHttpAuth(auth) && Boolean(getBearerToken(req));
}

/** 解析 trusted HTTP operator scope。 */
export function resolveTrustedHttpOperatorScopes(
  req: IncomingMessage,
  authOrRequest?:
    | SharedSecretGatewayAuth
    | Pick<AuthorizedGatewayHttpRequest, "trustDeclaredOperatorScopes">,
): string[] {
  if (!shouldTrustDeclaredHttpOperatorScopes(req, authOrRequest)) {
    // Gateway bearer 鉴权仅证明持有 shared secret。不允许 HTTP 客户端
    // 通过请求头自断言 operator scope。
    return [];
  }

  const headerValue = getHeader(req, "x-openclaw-scopes");
  if (headerValue === undefined) {
    // 无 scope 头 - 没有 explicit 头的 trusted 客户端获得默认 operator scope。
    return [...CLI_DEFAULT_OPERATOR_SCOPES];
  }
  const raw = headerValue.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

/** 解析 OpenAI 兼容 HTTP operator scope。 */
export function resolveOpenAiCompatibleHttpOperatorScopes(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
): string[] {
  return resolveSharedSecretHttpOperatorScopes(req, requestAuth);
}

/** 解析 shared-secret HTTP operator scope。 */
export function resolveSharedSecretHttpOperatorScopes(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
): string[] {
  if (usesSharedSecretGatewayMethod(requestAuth.authMethod)) {
    // Shared-secret HTTP bearer 鉴权是已文档化的 trusted-operator surface，
    // 用于直接选择加入的 HTTP surface。这是设计如此：token/password 鉴权
    // 证明持有 gateway operator secret，而非更窄的 per-request scope 身份，
    // 因此恢复正常的默认值。
    return [...CLI_DEFAULT_OPERATOR_SCOPES];
  }
  return resolveTrustedHttpOperatorScopes(req, requestAuth);
}

/** 判断 HTTP 发送者是否为 owner。 */
export function resolveHttpSenderIsOwner(
  req: IncomingMessage,
  authOrRequest?:
    | SharedSecretGatewayAuth
    | Pick<AuthorizedGatewayHttpRequest, "trustDeclaredOperatorScopes">,
): boolean {
  return resolveTrustedHttpOperatorScopes(req, authOrRequest).includes(ADMIN_SCOPE);
}

/** 判断 OpenAI 兼容 HTTP 发送者是否为 owner。 */
export function resolveOpenAiCompatibleHttpSenderIsOwner(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
): boolean {
  if (usesSharedSecretGatewayMethod(requestAuth.authMethod)) {
    // Shared-secret HTTP bearer 鉴权在兼容 API 和直接 /tools/invoke 上
    // 也携带 owner 语义。这是有意的：该 shared-secret 路径上没有独立的
    // per-request owner 原语，因此托管的附件所有权遵循已文档化的
    // trusted-operator 契约。
    return true;
  }
  return resolveHttpSenderIsOwner(req, requestAuth);
}

/** 鉴权 OpenAI 兼容 HTTP 模型覆盖。 */
export function authorizeOpenAiCompatibleHttpModelOverride(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
): { allowed: true } | { allowed: false; missingScope: typeof ADMIN_SCOPE } {
  const requestedModelOverride = normalizeOptionalString(getHeader(req, "x-openclaw-model"));
  if (!requestedModelOverride || resolveOpenAiCompatibleHttpSenderIsOwner(req, requestAuth)) {
    return { allowed: true };
  }
  return { allowed: false, missingScope: ADMIN_SCOPE };
}
