import { logger } from '../../logger.js';
import { normalizeAuthConfig, validateAuthConfig, getAuthMethodDescription } from './auth-config-utils.js';
import type { AuthConfig } from './auth-config-utils.js';

export type StartupAuthResult = {
  ok: boolean;
  config: AuthConfig;
  warnings: string[];
  errors: string[];
};

export type StartupAuthOptions = {
  config?: Partial<AuthConfig>;
  envOverrides?: Record<string, string | undefined>;
  requireAuth?: boolean;
  generateTokenIfMissing?: boolean;
};

function applyEnvOverrides(
  config: Partial<AuthConfig>,
  envOverrides: Record<string, string | undefined>,
): Partial<AuthConfig> {
  const result = { ...config };

  if (envOverrides.GATEWAY_AUTH_MODE) {
    result.mode = envOverrides.GATEWAY_AUTH_MODE as AuthConfig['mode'];
  }

  if (envOverrides.GATEWAY_AUTH_TOKEN) {
    result.token = envOverrides.GATEWAY_AUTH_TOKEN;
  }

  if (envOverrides.GATEWAY_AUTH_PASSWORD) {
    result.password = envOverrides.GATEWAY_AUTH_PASSWORD;
  }

  if (envOverrides.GATEWAY_TRUSTED_PROXIES) {
    result.trustedProxies = envOverrides.GATEWAY_TRUSTED_PROXIES.split(',').map((s) =>
      s.trim(),
    );
  }

  return result;
}

export async function initializeStartupAuth(
  options: StartupAuthOptions = {},
): Promise<StartupAuthResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  logger.info('[Gateway] Initializing startup authentication...');

  let config = options.config ?? { mode: 'none' };

  if (options.envOverrides) {
    config = applyEnvOverrides(config, options.envOverrides);
  }

  const validation = validateAuthConfig(config);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  const normalized = normalizeAuthConfig(config);

  if (options.requireAuth && normalized.mode === 'none') {
    if (options.generateTokenIfMissing) {
      const { generateToken } = await import('./auth-token-resolution.js');
      const token = generateToken(32);
      config = { ...config, mode: 'token', token };
      warnings.push(
        `Generated random auth token (set GATEWAY_AUTH_TOKEN to use a specific token)`,
      );
      logger.warn(
        '[Gateway] No auth configured, generated random token. Set GATEWAY_AUTH_TOKEN env var to use a specific token.',
      );
    } else {
      warnings.push('Auth is disabled (mode=none). This is insecure for production use.');
      logger.warn('[Gateway] Auth is disabled. This is insecure for production use.');
    }
  }

  const finalNormalized = normalizeAuthConfig(config);

  logger.info(
    `[Gateway] Auth mode: ${finalNormalized.mode}${finalNormalized.isSecure ? ' (secure)' : ''}`,
  );

  return {
    ok: errors.length === 0,
    config: finalNormalized,
    warnings,
    errors,
  };
}

export function getStartupAuthStatus(config: AuthConfig): {
  mode: string;
  isSecure: boolean;
  hasCredentials: boolean;
  description: string;
} {
  const normalized = normalizeAuthConfig(config);
  return {
    mode: normalized.mode,
    isSecure: normalized.isSecure,
    hasCredentials: normalized.hasCredentials,
    description: getAuthMethodDescription(normalized.mode),
  };
}
