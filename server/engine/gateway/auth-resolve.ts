// Gateway 鉴权解析器。
// 移植自 openclaw/src/gateway/auth-resolve.ts
//
// 适配说明：
//  - ../config/types.gateway.js（GatewayAuthConfig 等）在 cross-wms 中为 unknown stub，
//    此处定义本地结构化类型替代
//  - ../config/types.secrets.js（resolveSecretInputRef）在 cross-wms 中为 stub，
//    降级为：所有 token/password 值视为明文，不支持 SecretRef
//  - ./credentials.js（resolveGatewayCredentialsFromValues）在 cross-wms 中为 stub，
//    降级为：本地实现凭据解析，从 config 值 + env 变量读取
//
// 降级限制：
//  - 不支持 SecretRef 引用解析（env:、file: 等前缀）
//  - 不支持 token/password precedence 配置
//  - trustedProxy / tailscale 策略保留但仅做基础判断

import { normalizeOptionalString } from "../infra/string-coerce.js";

/** Gateway 鉴权配置（本地结构化类型，替代 cross-wms stub 的 unknown）。 */
export type GatewayAuthConfig = {
  mode?: ResolvedGatewayAuthMode;
  token?: string;
  password?: string;
  allowTailscale?: boolean;
  rateLimit?: unknown;
  trustedProxy?: GatewayTrustedProxyConfig;
};

/** Gateway trusted-proxy 配置（本地结构化类型）。 */
export type GatewayTrustedProxyConfig = {
  proxies?: string[];
  header?: string;
};

/** Gateway Tailscale 模式。 */
export type GatewayTailscaleMode = "off" | "serve" | "client";

/** 组合 config、override 和凭据输入后的鉴权模式。 */
export type ResolvedGatewayAuthMode = "none" | "token" | "password" | "trusted-proxy";

/** 记录哪个输入决定了有效 Gateway 鉴权模式。 */
export type ResolvedGatewayAuthModeSource =
  | "override"
  | "config"
  | "password"
  | "token"
  | "default";

/** 启动验证所需密钥前，完全解析的 Gateway 鉴权策略。 */
export type ResolvedGatewayAuth = {
  mode: ResolvedGatewayAuthMode;
  modeSource?: ResolvedGatewayAuthModeSource;
  token?: string;
  password?: string;
  allowTailscale: boolean;
  trustedProxy?: GatewayTrustedProxyConfig;
};

/** 暴露给仅支持单一 bearer secret 的 Gateway 客户端的 shared-secret 鉴权形态。 */
export type EffectiveSharedGatewayAuth = {
  mode: "token" | "password";
  secret: string | undefined;
};

/**
 * 从 config 值和 env 变量解析 gateway 凭据。
 *
 * 降级实现：openclaw 的 resolveGatewayCredentialsFromValues 支持完整的 precedence
 * 与 SecretRef 解析。此处简化为直接读取 config 值，回退到 env 变量。
 */
function resolveGatewayCredentialsFromValues(params: {
  configToken?: string;
  configPassword?: string;
  env: NodeJS.ProcessEnv;
}): { token?: string; password?: string } {
  const token =
    normalizeOptionalString(params.configToken) ??
    normalizeOptionalString(params.env.OPENCLAW_GATEWAY_AUTH_TOKEN) ??
    normalizeOptionalString(params.env.GATEWAY_AUTH_TOKEN);
  const password =
    normalizeOptionalString(params.configPassword) ??
    normalizeOptionalString(params.env.OPENCLAW_GATEWAY_AUTH_PASSWORD) ??
    normalizeOptionalString(params.env.GATEWAY_AUTH_PASSWORD);
  return { ...(token ? { token } : {}), ...(password ? { password } : {}) };
}

/**
 * 解析 Gateway 鉴权模式、凭据、trusted-proxy 策略和 Tailscale 许可。
 *
 * 合并持久化配置与运行时 override，从 env 读取凭据，并根据凭据存在性推断模式。
 */
export function resolveGatewayAuth(params: {
  authConfig?: GatewayAuthConfig | null;
  authOverride?: GatewayAuthConfig | null;
  env?: NodeJS.ProcessEnv;
  tailscaleMode?: GatewayTailscaleMode;
}): ResolvedGatewayAuth {
  const baseAuthConfig = params.authConfig ?? {};
  const authOverride = params.authOverride ?? undefined;
  const authConfig: GatewayAuthConfig = { ...baseAuthConfig };
  if (authOverride) {
    // 运行时 override 是稀疏字段覆盖；省略的字段保留持久化配置，
    // 这样调用方可以替换单个鉴权旋钮而无需克隆全部凭据与代理设置。
    if (authOverride.mode !== undefined) {
      authConfig.mode = authOverride.mode;
    }
    if (authOverride.token !== undefined) {
      authConfig.token = authOverride.token;
    }
    if (authOverride.password !== undefined) {
      authConfig.password = authOverride.password;
    }
    if (authOverride.allowTailscale !== undefined) {
      authConfig.allowTailscale = authOverride.allowTailscale;
    }
    if (authOverride.rateLimit !== undefined) {
      authConfig.rateLimit = authOverride.rateLimit;
    }
    if (authOverride.trustedProxy !== undefined) {
      authConfig.trustedProxy = authOverride.trustedProxy;
    }
  }
  const env = params.env ?? process.env;
  // 降级：SecretRef 不支持，所有值视为明文。
  const resolvedCredentials = resolveGatewayCredentialsFromValues({
    configToken: authConfig.token,
    configPassword: authConfig.password,
    env,
  });
  const token = resolvedCredentials.token;
  const password = resolvedCredentials.password;
  const trustedProxy = authConfig.trustedProxy;

  let mode: ResolvedGatewayAuth["mode"];
  let modeSource: ResolvedGatewayAuth["modeSource"];
  if (authOverride?.mode !== undefined) {
    mode = authOverride.mode;
    modeSource = "override";
  } else if (authConfig.mode) {
    mode = authConfig.mode;
    modeSource = "config";
  } else if (password) {
    mode = "password";
    modeSource = "password";
  } else if (token) {
    mode = "token";
    modeSource = "token";
  } else {
    // Token 保持默认，这样配置断言可以产生清晰的 missing-token 诊断，
    // 而不是静默禁用 Gateway 鉴权。
    mode = "token";
    modeSource = "default";
  }

  const allowTailscale =
    // Tailscale serve 可以提供网络级访问控制，但 password 和
    // trusted-proxy 模式保持其更严格的显式鉴权边界。
    authConfig.allowTailscale ??
    (params.tailscaleMode === "serve" && mode !== "password" && mode !== "trusted-proxy");

  return {
    mode,
    modeSource,
    token,
    password,
    allowTailscale,
    trustedProxy,
  };
}

/** 为无法建模每种鉴权模式的客户端返回有效的 token/password 密钥。 */
export function resolveEffectiveSharedGatewayAuth(params: {
  authConfig?: GatewayAuthConfig | null;
  authOverride?: GatewayAuthConfig | null;
  env?: NodeJS.ProcessEnv;
  tailscaleMode?: GatewayTailscaleMode;
}): EffectiveSharedGatewayAuth | null {
  const resolvedAuth = resolveGatewayAuth(params);
  if (resolvedAuth.mode === "token") {
    return {
      mode: "token",
      secret: resolvedAuth.token,
    };
  }
  if (resolvedAuth.mode === "password") {
    return {
      mode: "password",
      secret: resolvedAuth.password,
    };
  }
  return null;
}
