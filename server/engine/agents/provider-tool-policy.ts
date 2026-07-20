/**
 * 移植自 openclaw/src/agents/provider-tool-policy.ts
 *
 * Provider tool policy resolution. Ported from OpenClaw with simplified
 * normalization helpers (no external package dependencies).
 */

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase();
}

function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProviderId(value: string): string {
  return normalizeLowercaseStringOrEmpty(value).trim();
}

export function normalizeToolProviderPolicyKey(value: string): string {
  const normalized = normalizeLowercaseStringOrEmpty(value);
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) {
    return normalizeProviderId(normalized);
  }
  const provider = normalizeProviderId(normalized.slice(0, slashIndex));
  const modelId = normalized.slice(slashIndex + 1);
  return modelId ? `${provider}/${modelId}` : provider;
}

export function isCanonicalToolProviderPolicyKey(value: string): boolean {
  return normalizeLowercaseStringOrEmpty(value) === normalizeToolProviderPolicyKey(value);
}

type ProviderToolPolicyEntry = {
  key: string;
  policy: unknown;
};

export function resolveProviderToolPolicyEntry(params: {
  byProvider?: Record<string, unknown>;
  modelProvider?: string;
  modelId?: string;
}): ProviderToolPolicyEntry | undefined {
  const provider = params.modelProvider?.trim();
  if (!provider || !params.byProvider) {
    return undefined;
  }

  const lookup = new Map<
    string,
    ProviderToolPolicyEntry & { canonical: boolean }
  >();
  for (const [key, value] of Object.entries(params.byProvider)) {
    if (!isRecord(value)) {
      continue;
    }
    const normalized = normalizeToolProviderPolicyKey(key);
    if (!normalized) {
      continue;
    }
    const canonical = isCanonicalToolProviderPolicyKey(key);
    const existing = lookup.get(normalized);
    if (!existing || (canonical && !existing.canonical)) {
      lookup.set(normalized, { key, policy: value, canonical });
    }
  }

  const normalizedProvider = normalizeToolProviderPolicyKey(provider);
  const rawModelId = normalizeOptionalLowercaseString(params.modelId);
  const fullModelId = rawModelId ? `${normalizedProvider}/${rawModelId}` : undefined;
  const candidates = [...(fullModelId ? [fullModelId] : []), normalizedProvider];

  for (const key of candidates) {
    const match = lookup.get(key);
    if (match) {
      return { key: match.key, policy: match.policy };
    }
  }
  return undefined;
}

export function resolveProviderToolPolicy(params: {
  byProvider?: Record<string, unknown>;
  modelProvider?: string;
  modelId?: string;
}): unknown | undefined {
  return resolveProviderToolPolicyEntry(params)?.policy;
}
