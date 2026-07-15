/**
 * 认证解析 — 参考 OpenClaw gateway/auth-resolve.ts
 *
 * 组合配置认证、覆盖、环境凭证和策略。
 */

export type ResolvedGatewayAuthMode = 'none' | 'token' | 'password' | 'trusted-proxy';

export type ResolvedGatewayAuthModeSource =
  | 'override'
  | 'config'
  | 'password'
  | 'token'
  | 'default';

export interface GatewayTrustedProxyConfig {
  enabled?: boolean;
  header?: string;
  ipList?: string[];
}

export interface ResolvedGatewayAuth {
  mode: ResolvedGatewayAuthMode;
  modeSource?: ResolvedGatewayAuthModeSource;
  token?: string;
  password?: string;
  allowTailscale: boolean;
  trustedProxy?: GatewayTrustedProxyConfig;
}

export interface EffectiveSharedGatewayAuth {
  mode: 'token' | 'password';
  secret: string | undefined;
}

export interface GatewayAuthConfig {
  mode?: ResolvedGatewayAuthMode;
  token?: string;
  password?: string;
  allowTailscale?: boolean;
  rateLimit?: Record<string, unknown>;
  trustedProxy?: GatewayTrustedProxyConfig;
}

export function resolveGatewayAuth(params: {
  authConfig?: GatewayAuthConfig | null;
  authOverride?: GatewayAuthConfig | null;
  env?: NodeJS.ProcessEnv;
}): ResolvedGatewayAuth {
  const baseAuthConfig = params.authConfig ?? {};
  const authOverride = params.authOverride ?? undefined;
  const env = params.env ?? process.env;

  const authConfig: GatewayAuthConfig = { ...baseAuthConfig };

  if (authOverride) {
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

  const envToken = env.OPENCLAW_GATEWAY_TOKEN;
  const envPassword = env.OPENCLAW_GATEWAY_PASSWORD;

  let mode: ResolvedGatewayAuthMode = authConfig.mode ?? 'none';
  let modeSource: ResolvedGatewayAuthModeSource = 'config';
  let token: string | undefined = authConfig.token;
  let password: string | undefined = authConfig.password;

  if (envToken) {
    token = envToken;
    if (mode === 'none') {
      mode = 'token';
      modeSource = 'token';
    }
  }

  if (envPassword) {
    password = envPassword;
    if (mode === 'none') {
      mode = 'password';
      modeSource = 'password';
    }
  }

  if (mode === 'none') {
    modeSource = 'default';
  }

  return {
    mode,
    modeSource,
    token,
    password,
    allowTailscale: authConfig.allowTailscale ?? false,
    trustedProxy: authConfig.trustedProxy,
  };
}

export function resolveEffectiveSharedGatewayAuth(auth: ResolvedGatewayAuth): EffectiveSharedGatewayAuth {
  if (auth.token) {
    return { mode: 'token', secret: auth.token };
  }
  if (auth.password) {
    return { mode: 'password', secret: auth.password };
  }
  return { mode: 'token', secret: undefined };
}