/**
 * 凭证规划 — 参考 OpenClaw gateway/credential-planner.ts
 *
 * 在 SecretRef 解析之前分类本地/远程认证输入。
 */

export type GatewayCredentialInputPath =
  | 'gateway.auth.token'
  | 'gateway.auth.password'
  | 'gateway.remote.token'
  | 'gateway.remote.password';

export interface GatewayConfiguredCredentialInput {
  path: GatewayCredentialInputPath;
  configured: boolean;
  value?: string;
  refPath?: GatewayCredentialInputPath;
  hasSecretRef: boolean;
}

export interface GatewayCredentialPlan {
  configuredMode: 'local' | 'remote';
  authMode?: string;
  envToken?: string;
  envPassword?: string;
  localToken: GatewayConfiguredCredentialInput;
  localPassword: GatewayConfiguredCredentialInput;
  remoteToken: GatewayConfiguredCredentialInput;
  remotePassword: GatewayConfiguredCredentialInput;
  localTokenCanWin: boolean;
  localPasswordCanWin: boolean;
  localTokenSurfaceActive: boolean;
  tokenCanWin: boolean;
  passwordCanWin: boolean;
  remoteMode: boolean;
  remoteUrlConfigured: boolean;
  tailscaleRemoteExposure: boolean;
  remoteConfiguredSurface: boolean;
  remoteTokenFallbackActive: boolean;
  remoteTokenActive: boolean;
  remotePasswordFallbackActive: boolean;
  remotePasswordActive: boolean;
}

export function trimToUndefined(value: unknown): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

export function hasGatewayTokenEnvCandidate(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(trimToUndefined(env.OPENCLAW_GATEWAY_TOKEN));
}

export function hasGatewayPasswordEnvCandidate(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(trimToUndefined(env.OPENCLAW_GATEWAY_PASSWORD));
}

export function resolveGatewayCredentialPlan(config: Record<string, unknown> = {}): GatewayCredentialPlan {
  const authConfig = config.auth as Record<string, unknown> || {};
  const remoteConfig = config.remote as Record<string, unknown> || {};

  const localToken = resolveConfiguredCredentialInput(
    authConfig.token,
    'gateway.auth.token',
  );
  const localPassword = resolveConfiguredCredentialInput(
    authConfig.password,
    'gateway.auth.password',
  );
  const remoteToken = resolveConfiguredCredentialInput(
    remoteConfig.token,
    'gateway.remote.token',
  );
  const remotePassword = resolveConfiguredCredentialInput(
    remoteConfig.password,
    'gateway.remote.password',
  );

  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const envPassword = process.env.OPENCLAW_GATEWAY_PASSWORD;

  const remoteUrlConfigured = Boolean(remoteConfig.url);
  const remoteMode = remoteUrlConfigured;

  return {
    configuredMode: remoteMode ? 'remote' : 'local',
    authMode: authConfig.mode as string | undefined,
    envToken: trimToUndefined(envToken),
    envPassword: trimToUndefined(envPassword),
    localToken,
    localPassword,
    remoteToken,
    remotePassword,
    localTokenCanWin: !remoteMode && Boolean(localToken.value),
    localPasswordCanWin: !remoteMode && Boolean(localPassword.value),
    localTokenSurfaceActive: !remoteMode,
    tokenCanWin: Boolean(localToken.value || remoteToken.value || envToken),
    passwordCanWin: Boolean(localPassword.value || remotePassword.value || envPassword),
    remoteMode,
    remoteUrlConfigured,
    tailscaleRemoteExposure: Boolean(remoteConfig.tailscale),
    remoteConfiguredSurface: remoteMode && (Boolean(remoteToken.value) || Boolean(remotePassword.value)),
    remoteTokenFallbackActive: remoteMode && !remoteToken.value && Boolean(localToken.value),
    remoteTokenActive: remoteMode && (Boolean(remoteToken.value) || Boolean(localToken.value)),
    remotePasswordFallbackActive: remoteMode && !remotePassword.value && Boolean(localPassword.value),
    remotePasswordActive: remoteMode && (Boolean(remotePassword.value) || Boolean(localPassword.value)),
  };
}

function resolveConfiguredCredentialInput(
  value: unknown,
  path: GatewayCredentialInputPath,
): GatewayConfiguredCredentialInput {
  const trimmed = trimToUndefined(value);
  const hasSecretRef = trimmed ? trimmed.includes('${') || trimmed.includes('secret://') : false;

  return {
    path,
    configured: Boolean(trimmed),
    value: hasSecretRef ? undefined : trimmed,
    hasSecretRef,
  };
}