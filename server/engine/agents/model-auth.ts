/**
 * 移植自 openclaw/src/agents/model-auth.ts
 *
 * Resolves model-provider credentials from config, env, auth profiles, and
 * provider synthetic auth hooks. Simplified for cross-wms without deep
 * dependency on OpenClaw plugin/config/sessions subsystems.
 */

export { formatMissingAuthError, isMissingProviderAuthError, isProviderAuthError, MissingProviderAuthError, ProviderAuthError, requireApiKey, resolveAwsSdkEnvVarName } from "./model-auth-runtime-shared.js";
export { resolveEnvApiKey } from "./model-auth-env.js";
export type { ResolvedProviderAuth } from "./model-auth-runtime-shared.js";
export type { EnvApiKeyResult } from "./model-auth-env.js";
export type ProviderCredentialPrecedence = "profile-first" | "env-first";

/** Precomputed provider-auth lookup tables reused during one runtime turn. */
export type RuntimeProviderAuthLookup = {
  envApiKey?: {
    aliasMap?: Record<string, string>;
    candidateMap?: Record<string, string[]>;
    authEvidenceMap?: Record<string, string>;
    skipSetupProviderFallback?: boolean;
  };
  setupProviderFallbackRefs?: readonly string[];
  syntheticAuthProviderRefs?: readonly string[];
  syntheticAuthProviderRefsComplete?: boolean;
};

export type ProviderEntryApiKeyBindingResolution =
  | { kind: "none" }
  | { kind: "literal"; apiKey: string; source: string }
  | { kind: "profile-resolved"; auth: { apiKey: string; profileId?: string; source: string; mode: "api-key" | "oauth" | "token" | "aws-sdk" } }
  | { kind: "profile-incompatible"; profileId: string; credentialProvider: string; credentialType: string; reason: "credential-class" | "provider-binding" }
  | { kind: "profile-unresolved"; profileId: string; error?: unknown };

export type ModelAuthMode = "api-key" | "oauth" | "token" | "mixed" | "aws-sdk" | "unknown";

/** Builds stable env/synthetic auth lookup data for repeated provider checks. */
export function createRuntimeProviderAuthLookup(params: {
  cfg?: Record<string, unknown>;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  includePluginSyntheticAuth?: boolean;
}): RuntimeProviderAuthLookup {
  return {
    envApiKey: {
      skipSetupProviderFallback: true,
    },
  };
}

/** Reads a literal or env-secret marker for a custom provider entry. */
export function getCustomProviderApiKey(
  cfg: Record<string, unknown> | undefined,
  provider: string,
): string | undefined {
  if (!cfg) return undefined;
  const providers = cfg.models && typeof cfg.models === "object"
    ? (cfg.models as Record<string, unknown>).providers as Record<string, Record<string, unknown>> | undefined
    : undefined;
  if (!providers) return undefined;
  const entry = providers[provider];
  if (!entry) return undefined;
  const apiKey = entry.apiKey;
  if (typeof apiKey === "string" && apiKey.trim()) {
    return apiKey.trim();
  }
  return undefined;
}

/** Resolves custom provider API keys that are usable without mutating secret stores. */
export function resolveUsableCustomProviderApiKey(params: {
  cfg: Record<string, unknown> | undefined;
  provider: string;
  env?: NodeJS.ProcessEnv;
}): { apiKey: string; source: string } | null {
  const customKey = getCustomProviderApiKey(params.cfg, params.provider);
  if (!customKey) return null;
  // Check if it's an env var reference
  const env = params.env ?? process.env;
  const envValue = env[customKey];
  if (envValue && typeof envValue === "string" && envValue.trim()) {
    return { apiKey: envValue.trim(), source: `env:${customKey}` };
  }
  // Treat as literal key if it doesn't look like an env var name
  if (!/^[A-Z_][A-Z0-9_]*$/.test(customKey)) {
    return { apiKey: customKey, source: "models.json" };
  }
  return null;
}

/** True when a custom provider has a literal/env/local key available now. */
export function hasUsableCustomProviderApiKey(
  cfg: Record<string, unknown> | undefined,
  provider: string,
  env?: NodeJS.ProcessEnv,
): boolean {
  return Boolean(resolveUsableCustomProviderApiKey({ cfg, provider, env }));
}

/** True when explicit provider config should outrank profile/environment auth. */
export function shouldPreferExplicitConfigApiKeyAuth(
  cfg: Record<string, unknown> | undefined,
  provider: string,
): boolean {
  if (!cfg) return false;
  const providers = cfg.models && typeof cfg.models === "object"
    ? (cfg.models as Record<string, unknown>).providers as Record<string, Record<string, unknown>> | undefined
    : undefined;
  if (!providers) return false;
  const entry = providers[provider];
  if (!entry) return false;
  const auth = entry.auth;
  return auth === "api-key" && typeof entry.apiKey === "string" && entry.apiKey.trim().length > 0;
}

/** True when a bearer auth profile can safely satisfy a provider-entry apiKey reference. */
export function canUseProfileAsProviderEntryApiKey(params: {
  cfg?: Record<string, unknown>;
  provider: string;
  credential: { type: string; provider: string };
}): boolean {
  const cred = params.credential;
  // Only bearer credentials (api_key, token) can serve as apiKey
  if (cred.type !== "api_key" && cred.type !== "token") {
    return false;
  }
  // Compatible if same provider
  return cred.provider.toLowerCase().trim() === params.provider.toLowerCase().trim();
}

/** Classifies a provider entry apiKey as literal/profile/marker before resolving secrets. */
export function resolveProviderEntryApiKeyProfileReference(params: {
  cfg?: Record<string, unknown>;
  provider: string;
  store: { profiles: Record<string, { type: string; provider: string }> };
}):
  | { kind: "none" }
  | { kind: "literal"; apiKey: string; source: string }
  | { kind: "marker" }
  | { kind: "profile"; profileId: string; credential: { type: string; provider: string }; mode: "api-key" | "oauth" | "token" }
  | { kind: "profile-incompatible"; profileId: string; credentialProvider: string; credentialType: string; reason: "credential-class" | "provider-binding" }
{
  if (!params.cfg) return { kind: "none" };
  const providers = params.cfg.models && typeof params.cfg.models === "object"
    ? (params.cfg as Record<string, unknown>).models as Record<string, unknown> | undefined
    : undefined;
  if (!providers) return { kind: "none" };
  const providerConfig = (providers as Record<string, Record<string, unknown>>).providers?.[params.provider] as Record<string, unknown> | undefined;
  if (!providerConfig) return { kind: "none" };
  const apiKey = providerConfig.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim()) return { kind: "none" };
  const key = apiKey.trim();
  const credential = params.store.profiles[key];
  if (!credential) {
    return { kind: "literal", apiKey: key, source: "models.json" };
  }
  if (credential.type !== "api_key" && credential.type !== "token") {
    return {
      kind: "profile-incompatible",
      profileId: key,
      credentialProvider: credential.provider,
      credentialType: credential.type,
      reason: "credential-class",
    };
  }
  if (!canUseProfileAsProviderEntryApiKey({ cfg: params.cfg, provider: params.provider, credential })) {
    return {
      kind: "profile-incompatible",
      profileId: key,
      credentialProvider: credential.provider,
      credentialType: credential.type,
      reason: "provider-binding",
    };
  }
  return {
    kind: "profile",
    profileId: key,
    credential,
    mode: credential.type === "token" ? "token" : "api-key",
  };
}

/** Resolves a provider-entry apiKey profile reference into runtime auth when possible. */
export async function resolveProviderEntryApiKeyBinding(params: {
  cfg?: Record<string, unknown>;
  provider: string;
  store: { profiles: Record<string, { type: string; provider: string }> };
  agentDir?: string;
}): Promise<ProviderEntryApiKeyBindingResolution> {
  const reference = resolveProviderEntryApiKeyProfileReference(params as never);
  if (reference.kind === "none" || reference.kind === "marker") {
    return { kind: "none" };
  }
  if (reference.kind === "literal") {
    return reference;
  }
  if (reference.kind === "profile-incompatible") {
    return reference;
  }
  // profile - would need actual profile resolution
  return { kind: "profile-unresolved", profileId: reference.profileId };
}

/** True when a custom local provider can use a synthetic no-auth placeholder. */
export function hasSyntheticLocalProviderAuthConfig(params: {
  cfg: Record<string, unknown> | undefined;
  provider: string;
}): boolean {
  if (!params.cfg) return false;
  const providers = params.cfg.models && typeof params.cfg.models === "object"
    ? (params.cfg.models as Record<string, unknown>).providers as Record<string, Record<string, unknown>> | undefined
    : undefined;
  if (!providers) return false;
  const entry = providers[params.provider];
  if (!entry) return false;
  const baseUrl = typeof entry.baseUrl === "string" ? entry.baseUrl.trim() : "";
  const api = typeof entry.api === "string" ? entry.api.trim() : "";
  if (!baseUrl || !api) return false;
  if (entry.apiKey) return false;
  // Check if baseUrl is local
  try {
    const host = new URL(baseUrl).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/** Fast auth-availability check for runtime provider/model selection. */
export function hasRuntimeAvailableProviderAuth(params: {
  provider: string;
  cfg?: Record<string, unknown>;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  allowPluginSyntheticAuth?: boolean;
  runtimeLookup?: RuntimeProviderAuthLookup;
  modelApi?: string;
}): boolean {
  const provider = params.provider.toLowerCase().trim();
  // Check env
  const env = params.env ?? process.env;
  const envKey = env[`${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`];
  if (envKey && envKey.trim()) return true;
  // Check custom provider config
  if (resolveUsableCustomProviderApiKey({ cfg: params.cfg, provider: params.provider, env })) return true;
  // Check synthetic local
  if (hasSyntheticLocalProviderAuthConfig({ cfg: params.cfg, provider: params.provider })) return true;
  return false;
}

/** Resolves the credential that should be used for one provider request. */
export async function resolveApiKeyForProvider(params: {
  provider: string;
  cfg?: Record<string, unknown>;
  profileId?: string;
  preferredProfile?: string;
  store?: { profiles: Record<string, { type: string; provider: string }> };
  agentDir?: string;
  workspaceDir?: string;
  lockedProfile?: boolean;
  forceRefresh?: boolean;
  credentialPrecedence?: ProviderCredentialPrecedence;
  modelApi?: string;
}): Promise<{ apiKey: string; profileId?: string; source: string; mode: "api-key" | "oauth" | "token" | "aws-sdk" }> {
  const provider = params.provider.toLowerCase().trim();
  // Check env first
  const env = process.env;
  const envKeyName = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  const envKey = env[envKeyName];
  if (envKey && envKey.trim()) {
    return { apiKey: envKey.trim(), source: `env:${envKeyName}`, mode: "api-key" };
  }
  // Check custom provider config
  const customKey = resolveUsableCustomProviderApiKey({ cfg: params.cfg, provider: params.provider, env });
  if (customKey) {
    return { apiKey: customKey.apiKey, source: customKey.source, mode: "api-key" };
  }
  // Check synthetic local
  if (hasSyntheticLocalProviderAuthConfig({ cfg: params.cfg, provider: params.provider })) {
    return { apiKey: "local-no-auth", source: `models.providers.${params.provider} (synthetic local key)`, mode: "api-key" };
  }
  throw new Error(`No API key found for provider "${params.provider}".`);
}

/** Reports the strongest configured auth mode for provider-list UI and diagnostics. */
export function resolveModelAuthMode(
  provider?: string,
  cfg?: Record<string, unknown>,
  store?: { profiles: Record<string, { type: string }> },
  options?: { workspaceDir?: string },
): ModelAuthMode | undefined {
  const resolved = provider?.trim();
  if (!resolved) return undefined;
  // Check custom provider
  if (hasUsableCustomProviderApiKey(cfg, resolved)) return "api-key";
  // Check env
  const envKeyName = `${resolved.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  if (process.env[envKeyName]?.trim()) return "api-key";
  return "unknown";
}

/** Checks provider auth availability, including profile fallback order. */
export async function hasAvailableAuthForProvider(params: {
  provider: string;
  cfg?: Record<string, unknown>;
  preferredProfile?: string;
  store?: { profiles: Record<string, { type: string; provider: string }> };
  agentDir?: string;
  workspaceDir?: string;
  modelApi?: string;
}): Promise<boolean> {
  return hasRuntimeAvailableProviderAuth({
    provider: params.provider,
    cfg: params.cfg,
    workspaceDir: params.workspaceDir,
    modelApi: params.modelApi,
  });
}

/** Resolves request credentials from the provider attached to a model descriptor. */
export async function getApiKeyForModel(params: {
  model: { provider: string; api?: string };
  cfg?: Record<string, unknown>;
  profileId?: string;
  preferredProfile?: string;
  store?: { profiles: Record<string, { type: string; provider: string }> };
  agentDir?: string;
  workspaceDir?: string;
  lockedProfile?: boolean;
  credentialPrecedence?: ProviderCredentialPrecedence;
}): Promise<{ apiKey: string; profileId?: string; source: string; mode: "api-key" | "oauth" | "token" | "aws-sdk" }> {
  return resolveApiKeyForProvider({
    provider: params.model.provider,
    cfg: params.cfg,
    profileId: params.profileId,
    preferredProfile: params.preferredProfile,
    store: params.store,
    agentDir: params.agentDir,
    workspaceDir: params.workspaceDir,
    lockedProfile: params.lockedProfile,
    credentialPrecedence: params.credentialPrecedence,
    modelApi: params.model.api,
  });
}

/** Clears auth for local OpenAI-compatible servers that explicitly use no auth. */
export function applyLocalNoAuthHeaderOverride<T extends Record<string, unknown>>(model: T, auth: { apiKey?: string } | null | undefined): T {
  if (auth?.apiKey !== "local-no-auth") return model;
  const api = (model as Record<string, unknown>).api;
  if (api !== "openai-completions") return model;
  return {
    ...model,
    headers: { Authorization: null },
  } as T;
}

/**
 * When the provider config sets `authHeader: true`, inject an explicit
 * `Authorization: Bearer <apiKey>` header into the model.
 */
export function applyAuthHeaderOverride<T extends Record<string, unknown>>(model: T, auth: { apiKey?: string } | null | undefined, cfg: Record<string, unknown> | undefined): T {
  if (!auth?.apiKey) return model;
  // Simple implementation: check for authHeader flag in provider config
  const providers = cfg?.models && typeof cfg.models === "object"
    ? (cfg.models as Record<string, unknown>).providers as Record<string, Record<string, unknown>> | undefined
    : undefined;
  const provider = (model as Record<string, unknown>).provider as string | undefined;
  const entry = provider ? providers?.[provider] : undefined;
  if (!entry?.authHeader) return model;
  const headers: Record<string, string> = {};
  const existingHeaders = (model as Record<string, unknown>).headers as Record<string, string> | undefined;
  if (existingHeaders) {
    for (const [key, value] of Object.entries(existingHeaders)) {
      if (key.toLowerCase() !== "authorization") {
        headers[key] = value;
      }
    }
  }
  headers.Authorization = `Bearer ${auth.apiKey}`;
  return { ...model, headers } as T;
}
