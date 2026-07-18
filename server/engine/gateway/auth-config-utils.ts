import type { GatewayAuthResult } from './auth.js';

export type AuthMode = 'none' | 'token' | 'password' | 'trusted-proxy' | 'tailscale';

export type AuthConfig = {
  mode: AuthMode;
  token?: string;
  password?: string;
  trustedProxies?: string[];
  tokenHash?: string;
  passwordHash?: string;
  allowInsecure?: boolean;
  requireHttps?: boolean;
  sessionTimeoutMs?: number;
  maxFailedAttempts?: number;
  lockoutDurationMs?: number;
};

export type NormalizedAuthConfig = Required<Pick<AuthConfig, 'mode'>> &
  Partial<AuthConfig> & {
    isSecure: boolean;
    hasCredentials: boolean;
  };

export function normalizeAuthConfig(config?: Partial<AuthConfig>): NormalizedAuthConfig {
  const mode = (config?.mode ?? 'none') as AuthMode;
  const hasCredentials = Boolean(
    (mode === 'token' && (config?.token || config?.tokenHash)) ||
      (mode === 'password' && (config?.password || config?.passwordHash)) ||
      mode === 'trusted-proxy' ||
      mode === 'tailscale',
  );

  return {
    mode,
    token: config?.token,
    password: config?.password,
    trustedProxies: config?.trustedProxies ?? [],
    tokenHash: config?.tokenHash,
    passwordHash: config?.passwordHash,
    allowInsecure: config?.allowInsecure ?? false,
    requireHttps: config?.requireHttps ?? false,
    sessionTimeoutMs: config?.sessionTimeoutMs ?? 86400000,
    maxFailedAttempts: config?.maxFailedAttempts ?? 5,
    lockoutDurationMs: config?.lockoutDurationMs ?? 900000,
    isSecure: mode !== 'none' && hasCredentials,
    hasCredentials,
  };
}

export function validateAuthConfig(config?: Partial<AuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const normalized = normalizeAuthConfig(config);

  if (normalized.mode === 'token' && !normalized.token && !normalized.tokenHash) {
    errors.push('token auth mode requires token or tokenHash');
  }

  if (normalized.mode === 'password' && !normalized.password && !normalized.passwordHash) {
    errors.push('password auth mode requires password or passwordHash');
  }

  if (normalized.mode === 'trusted-proxy' && (!normalized.trustedProxies || normalized.trustedProxies.length === 0)) {
    errors.push('trusted-proxy auth mode requires at least one trusted proxy');
  }

  if (normalized.requireHttps && normalized.allowInsecure) {
    errors.push('requireHttps and allowInsecure cannot both be true');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getAuthMethodDescription(mode: AuthMode): string {
  switch (mode) {
    case 'none':
      return 'No authentication required';
    case 'token':
      return 'Bearer token authentication';
    case 'password':
      return 'Password authentication';
    case 'trusted-proxy':
      return 'Trusted proxy authentication';
    case 'tailscale':
      return 'Tailscale authentication';
    default:
      return 'Unknown authentication method';
  }
}

export function mergeAuthConfigs(
  base: Partial<AuthConfig>,
  override: Partial<AuthConfig>,
): NormalizedAuthConfig {
  return normalizeAuthConfig({
    ...base,
    ...override,
    trustedProxies: [
      ...(base.trustedProxies ?? []),
      ...(override.trustedProxies ?? []),
    ],
  });
}

export function authResultToHttpStatus(result: GatewayAuthResult): number {
  if (result.ok) {
    return 200;
  }
  if (result.rateLimited) {
    return 429;
  }
  return 401;
}
