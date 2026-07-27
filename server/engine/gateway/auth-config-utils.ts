// Gateway auth config utilities materialize token/password SecretRefs only for
// the auth mode that can actually consume them.
import type { GatewayAuthConfig } from "../config/types.gateway.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { hasConfiguredSecretInput, resolveSecretInputRef } from "../config/types.secrets.js";
import { resolveRequiredConfiguredSecretRefInputString } from "./resolve-configured-secret-input-string.js";
import {
  assignResolvedGatewaySecretInput,
  readGatewaySecretInputValue,
  type SupportedGatewaySecretInputPath,
} from "./secret-input-paths.js";

export type AuthConfig = {
  mode: "none" | "token" | "password" | "trusted-proxy" | "tailscale";
  token?: string;
  tokenHash?: string;
  password?: string;
  passwordHash?: string;
  trustedProxies?: string[];
  allowInsecure?: boolean;
  requireHttps?: boolean;
  sessionTimeoutMs?: number;
  maxFailedAttempts?: number;
  lockoutDurationMs?: number;
  hasCredentials?: boolean;
  isSecure?: boolean;
};

type GatewayAuthSecretInputPath = Extract<
  SupportedGatewaySecretInputPath,
  "gateway.auth.token" | "gateway.auth.password"
>;

type GatewayAuthSecretRefResolutionParams = {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  mode?: GatewayAuthConfig["mode"];
  hasPasswordCandidate: boolean;
  hasTokenCandidate: boolean;
};

/** Check whether a local Gateway auth input is configured directly or through defaults. */
export function hasConfiguredGatewayAuthSecretInput(
  cfg: OpenClawConfig,
  path: GatewayAuthSecretInputPath,
): boolean {
  return hasConfiguredSecretInput(readGatewaySecretInputValue(cfg, path), cfg.secrets?.defaults);
}

/** Decide whether a token/password secret ref can be active for the configured auth mode. */
function shouldResolveGatewayAuthSecretRef(params: {
  mode?: GatewayAuthConfig["mode"];
  path: GatewayAuthSecretInputPath;
  hasPasswordCandidate: boolean;
  hasTokenCandidate: boolean;
}): boolean {
  const isTokenPath = params.path === "gateway.auth.token";
  const hasPathCandidate = isTokenPath ? params.hasTokenCandidate : params.hasPasswordCandidate;
  if (hasPathCandidate) {
    return false;
  }
  if (params.mode === (isTokenPath ? "token" : "password")) {
    return true;
  }
  if (params.mode === "trusted-proxy") {
    return !isTokenPath;
  }
  if (params.mode === "token" || params.mode === "none") {
    return false;
  }
  if (params.mode === "password") {
    return !isTokenPath;
  }
  // With implicit mode, resolve the side that does not already have a concrete
  // candidate so token and password defaults do not both get materialized.
  return isTokenPath ? !params.hasPasswordCandidate : !params.hasTokenCandidate;
}

function shouldResolveGatewayTokenSecretRef(
  params: Omit<GatewayAuthSecretRefResolutionParams, "cfg" | "env">,
): boolean {
  return shouldResolveGatewayAuthSecretRef({
    mode: params.mode,
    path: "gateway.auth.token",
    hasPasswordCandidate: params.hasPasswordCandidate,
    hasTokenCandidate: params.hasTokenCandidate,
  });
}

function shouldResolveGatewayPasswordSecretRef(
  params: Omit<GatewayAuthSecretRefResolutionParams, "cfg" | "env">,
): boolean {
  return shouldResolveGatewayAuthSecretRef({
    mode: params.mode,
    path: "gateway.auth.password",
    hasPasswordCandidate: params.hasPasswordCandidate,
    hasTokenCandidate: params.hasTokenCandidate,
  });
}

function hasActiveExecGatewayAuthSecretRef(params: {
  cfg: OpenClawConfig;
  path: GatewayAuthSecretInputPath;
  shouldResolve: boolean;
}): boolean {
  if (!params.shouldResolve) {
    return false;
  }
  const { ref } = resolveSecretInputRef({
    value: readGatewaySecretInputValue(params.cfg, params.path),
    defaults: params.cfg.secrets?.defaults,
  });
  return ref?.source === "exec";
}

/** Check whether active local Gateway auth refs can be read without invoking exec providers. */
export function canMaterializeGatewayAuthSecretRefsWithoutExec(
  params: GatewayAuthSecretRefResolutionParams,
): boolean {
  return !(
    hasActiveExecGatewayAuthSecretRef({
      cfg: params.cfg,
      path: "gateway.auth.token",
      shouldResolve: shouldResolveGatewayTokenSecretRef(params),
    }) ||
    hasActiveExecGatewayAuthSecretRef({
      cfg: params.cfg,
      path: "gateway.auth.password",
      shouldResolve: shouldResolveGatewayPasswordSecretRef(params),
    })
  );
}

async function resolveGatewayAuthSecretRefValue(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  path: GatewayAuthSecretInputPath;
  shouldResolve: boolean;
}): Promise<string | undefined> {
  if (!params.shouldResolve) {
    return undefined;
  }
  const value = await resolveRequiredConfiguredSecretRefInputString({
    config: params.cfg,
    env: params.env,
    value: readGatewaySecretInputValue(params.cfg, params.path),
    path: params.path,
  });
  if (!value) {
    return undefined;
  }
  return value;
}

/** Resolve the Gateway auth token ref only when token auth can use it. */
export async function resolveGatewayTokenSecretRefValue(
  params: GatewayAuthSecretRefResolutionParams,
): Promise<string | undefined> {
  return resolveGatewayAuthSecretRefValue({
    cfg: params.cfg,
    env: params.env,
    path: "gateway.auth.token",
    shouldResolve: shouldResolveGatewayTokenSecretRef(params),
  });
}

/** Resolve the Gateway auth password ref only when password auth can use it. */
export async function resolveGatewayPasswordSecretRefValue(
  params: GatewayAuthSecretRefResolutionParams,
): Promise<string | undefined> {
  return resolveGatewayAuthSecretRefValue({
    cfg: params.cfg,
    env: params.env,
    path: "gateway.auth.password",
    shouldResolve: shouldResolveGatewayPasswordSecretRef(params),
  });
}

async function resolveGatewayAuthSecretRef(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  path: GatewayAuthSecretInputPath;
  shouldResolve: boolean;
}): Promise<OpenClawConfig> {
  const value = await resolveGatewayAuthSecretRefValue(params);
  if (!value) {
    return params.cfg;
  }
  // Mutate a clone so startup validation can materialize secrets without
  // altering the caller's raw config object.
  const nextConfig = structuredClone(params.cfg);
  nextConfig.gateway ??= {};
  nextConfig.gateway.auth ??= {};
  assignResolvedGatewaySecretInput({
    config: nextConfig,
    path: params.path,
    value,
  });
  return nextConfig;
}

async function resolveGatewayPasswordSecretRef(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  mode?: GatewayAuthConfig["mode"];
  hasPasswordCandidate: boolean;
  hasTokenCandidate: boolean;
}): Promise<OpenClawConfig> {
  return resolveGatewayAuthSecretRef({
    cfg: params.cfg,
    env: params.env,
    path: "gateway.auth.password",
    shouldResolve: shouldResolveGatewayPasswordSecretRef(params),
  });
}

/** Materialize active local Gateway auth secret refs on a cloned config. */
export async function materializeGatewayAuthSecretRefs(
  params: GatewayAuthSecretRefResolutionParams,
): Promise<OpenClawConfig> {
  const cfgWithToken = await resolveGatewayAuthSecretRef({
    cfg: params.cfg,
    env: params.env,
    path: "gateway.auth.token",
    shouldResolve: shouldResolveGatewayTokenSecretRef(params),
  });
  return await resolveGatewayPasswordSecretRef({
    cfg: cfgWithToken,
    env: params.env,
    mode: params.mode,
    hasPasswordCandidate: params.hasPasswordCandidate,
    hasTokenCandidate:
      params.hasTokenCandidate ||
      hasConfiguredGatewayAuthSecretInput(cfgWithToken, "gateway.auth.token"),
  });
}

export function normalizeAuthConfig(config?: Partial<AuthConfig>): AuthConfig {
  const defaults = {
    trustedProxies: [],
    allowInsecure: false,
    requireHttps: false,
    sessionTimeoutMs: 86400000,
    maxFailedAttempts: 5,
    lockoutDurationMs: 900000,
  };

  const resolvedMode = config?.mode ?? "none";

  let hasCredentials = false;
  let isSecure = false;

  if (resolvedMode === "token") {
    hasCredentials = Boolean(config?.token || config?.tokenHash);
    isSecure = hasCredentials;
  } else if (resolvedMode === "password") {
    hasCredentials = Boolean(config?.password || config?.passwordHash);
    isSecure = hasCredentials;
  } else if (resolvedMode === "trusted-proxy") {
    hasCredentials = true;
    isSecure = true;
  } else if (resolvedMode === "tailscale") {
    hasCredentials = true;
    isSecure = true;
  }

  return {
    mode: resolvedMode,
    token: config?.token,
    tokenHash: config?.tokenHash,
    password: config?.password,
    passwordHash: config?.passwordHash,
    trustedProxies: config?.trustedProxies ?? defaults.trustedProxies,
    allowInsecure: config?.allowInsecure ?? defaults.allowInsecure,
    requireHttps: config?.requireHttps ?? defaults.requireHttps,
    sessionTimeoutMs: config?.sessionTimeoutMs ?? defaults.sessionTimeoutMs,
    maxFailedAttempts: config?.maxFailedAttempts ?? defaults.maxFailedAttempts,
    lockoutDurationMs: config?.lockoutDurationMs ?? defaults.lockoutDurationMs,
    hasCredentials,
    isSecure,
  };
}

export function validateAuthConfig(config: Partial<AuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.mode === "token" && !config.token && !config.tokenHash) {
    errors.push("token auth mode requires token or tokenHash");
  }

  if (config.mode === "password" && !config.password && !config.passwordHash) {
    errors.push("password auth mode requires password or passwordHash");
  }

  if (config.mode === "trusted-proxy" && (!config.trustedProxies || config.trustedProxies.length === 0)) {
    errors.push("trusted-proxy auth mode requires at least one trusted proxy");
  }

  if (config.requireHttps === true && config.allowInsecure === true) {
    errors.push("requireHttps and allowInsecure cannot both be true");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getAuthMethodDescription(mode: string): string {
  switch (mode) {
    case "none":
      return "No authentication required";
    case "token":
      return "Bearer token authentication";
    case "password":
      return "Password authentication";
    case "trusted-proxy":
      return "Trusted proxy authentication";
    case "tailscale":
      return "Tailscale authentication";
    default:
      return "Unknown authentication method";
  }
}

export function mergeAuthConfigs(base: Partial<AuthConfig>, override: Partial<AuthConfig>): AuthConfig {
  const mergedTrustedProxies = [
    ...(base.trustedProxies ?? []),
    ...(override.trustedProxies ?? []),
  ];

  const merged = {
    ...base,
    ...override,
    trustedProxies: mergedTrustedProxies.length > 0 ? mergedTrustedProxies : [],
  };

  return normalizeAuthConfig(merged);
}

export function authResultToHttpStatus(result: {
  ok: boolean;
  method?: string;
  rateLimited?: boolean;
  reason?: string;
}): number {
  if (result.ok) {
    return 200;
  }
  if (result.rateLimited) {
    return 429;
  }
  return 401;
}
