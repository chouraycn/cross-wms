/**
 * 移植自 openclaw/src/agents/live-auth-keys.ts
 *
 * Live-test provider API-key discovery. Reads provider-specific and
 * manifest-declared env names without logging or exposing secret values.
 */

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase();
}

const KEY_SPLIT_RE = /[\s,;]+/g;

const PROVIDER_PREFIX_OVERRIDES: Record<string, string> = {
  google: "GEMINI",
  "google-vertex": "GEMINI",
};

type ProviderApiKeyConfig = {
  liveSingle?: string;
  listVar?: string;
  primaryVar?: string;
  prefixedVar?: string;
  fallbackVars: string[];
};

const PROVIDER_API_KEY_CONFIG: Record<string, Omit<ProviderApiKeyConfig, "fallbackVars">> = {
  anthropic: {
    liveSingle: "OPENCLAW_LIVE_ANTHROPIC_KEY",
    listVar: "OPENCLAW_LIVE_ANTHROPIC_KEYS",
    primaryVar: "ANTHROPIC_API_KEY",
    prefixedVar: "ANTHROPIC_API_KEY_",
  },
  google: {
    liveSingle: "OPENCLAW_LIVE_GEMINI_KEY",
    listVar: "GEMINI_API_KEYS",
    primaryVar: "GEMINI_API_KEY",
    prefixedVar: "GEMINI_API_KEY_",
  },
  "google-vertex": {
    liveSingle: "OPENCLAW_LIVE_GEMINI_KEY",
    listVar: "GEMINI_API_KEYS",
    primaryVar: "GEMINI_API_KEY",
    prefixedVar: "GEMINI_API_KEY_",
  },
  openai: {
    liveSingle: "OPENCLAW_LIVE_OPENAI_KEY",
    listVar: "OPENAI_API_KEYS",
    primaryVar: "OPENAI_API_KEY",
    prefixedVar: "OPENAI_API_KEY_",
  },
};

function normalizeProviderId(provider: string): string {
  return normalizeLowercaseStringOrEmpty(provider).trim();
}

function parseKeyList(raw?: string | null): string[] {
  if (!raw) {
    return [];
  }
  return raw.split(KEY_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
}

function collectEnvPrefixedKeys(prefix: string, env: NodeJS.ProcessEnv): string[] {
  const keys: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(prefix)) {
      continue;
    }
    const trimmed = normalizeOptionalString(value);
    if (!trimmed) {
      continue;
    }
    keys.push(trimmed);
  }
  return keys;
}

function resolveProviderApiKeyConfig(provider: string): ProviderApiKeyConfig {
  const normalized = normalizeProviderId(provider);
  const custom = PROVIDER_API_KEY_CONFIG[normalized];
  const base = PROVIDER_PREFIX_OVERRIDES[normalized] ?? normalized.toUpperCase().replace(/-/g, "_");

  const liveSingle = custom?.liveSingle ?? `OPENCLAW_LIVE_${base}_KEY`;
  const listVar = custom?.listVar ?? `${base}_API_KEYS`;
  const primaryVar = custom?.primaryVar ?? `${base}_API_KEY`;
  const prefixedVar = custom?.prefixedVar ?? `${base}_API_KEY_`;

  if (normalized === "google" || normalized === "google-vertex") {
    return { liveSingle, listVar, primaryVar, prefixedVar, fallbackVars: ["GOOGLE_API_KEY"] };
  }

  return { liveSingle, listVar, primaryVar, prefixedVar, fallbackVars: [] };
}

/** Collect configured API keys for live provider tests without exposing values. */
export function collectProviderApiKeys(
  provider: string,
  options: { env?: NodeJS.ProcessEnv } = {},
): string[] {
  const env = options.env ?? process.env;
  const normalizedProvider = normalizeProviderId(provider);
  const config = resolveProviderApiKeyConfig(normalizedProvider);

  const forcedSingle = config.liveSingle
    ? normalizeOptionalString(env[config.liveSingle])
    : undefined;
  if (forcedSingle) {
    return [forcedSingle];
  }

  const fromList = parseKeyList(config.listVar ? env[config.listVar] : undefined);
  const primary = config.primaryVar ? normalizeOptionalString(env[config.primaryVar]) : undefined;
  const fromPrefixed = config.prefixedVar ? collectEnvPrefixedKeys(config.prefixedVar, env) : [];

  const fallback = config.fallbackVars
    .map((envVar) => normalizeOptionalString(env[envVar]))
    .filter(Boolean) as string[];

  const seen = new Set<string>();
  const add = (value?: string) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
  };

  for (const value of fromList) { add(value); }
  add(primary);
  for (const value of fromPrefixed) { add(value); }
  for (const value of fallback) { add(value); }

  return Array.from(seen);
}

/** Collect Anthropic API keys for live cache/model tests when OAuth is unavailable. */
export function collectAnthropicApiKeys(options: { env?: NodeJS.ProcessEnv } = {}): string[] {
  const env = options.env ?? process.env;
  if (normalizeOptionalString(env.ANTHROPIC_OAUTH_TOKEN)) {
    return [];
  }
  return collectProviderApiKeys("anthropic", { ...options, env });
}

/** Return whether a provider error message indicates API-key rate limiting. */
export function isApiKeyRateLimitError(message: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(message);
  return (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("quota exceeded") ||
    lower.includes("quota_exceeded") ||
    lower.includes("resource exhausted") ||
    lower.includes("resource_exhausted") ||
    lower.includes("too many requests")
  );
}

/** Return whether an Anthropic error message indicates billing exhaustion. */
export function isAnthropicBillingError(message: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(message);
  return (
    lower.includes("credit balance") ||
    lower.includes("insufficient credit") ||
    lower.includes("insufficient credits") ||
    lower.includes("payment required") ||
    (lower.includes("billing") && lower.includes("disabled")) ||
    /["']?(?:status|code)["']?\s*[:=]\s*402\b|\bhttp\s*402\b|\berror(?:\s+code)?\s*[:=]?\s*402\b|\b(?:got|returned|received)\s+(?:a\s+)?402\b|^\s*402\spayment/i.test(lower)
  );
}
