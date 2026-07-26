// Legacy model-provider aliases that encoded runtime/backend selection in model refs.
// 移植自 openclaw/src/commands/doctor/shared/legacy-runtime-model-providers.ts
import { normalizeProviderId } from "../../../plugins/_openclaw__model_catalog_core__provider_id.js";
import { normalizeStaticProviderModelId } from "../../../agents/model-ref-shared.js";

type LegacyRuntimeModelProviderAlias = {
  legacyProvider: string;
  provider: string;
  runtime: string;
  cli: boolean;
  requiresRuntimePolicy: boolean;
};

const LEGACY_RUNTIME_MODEL_PROVIDER_ALIASES = [
  {
    legacyProvider: "codex",
    provider: "openai",
    runtime: "codex",
    cli: false,
    requiresRuntimePolicy: false,
  },
  {
    legacyProvider: "codex-cli",
    provider: "openai",
    runtime: "codex",
    cli: false,
    requiresRuntimePolicy: true,
  },
  {
    legacyProvider: "claude-cli",
    provider: "anthropic",
    runtime: "claude-cli",
    cli: true,
    requiresRuntimePolicy: true,
  },
  {
    legacyProvider: "google-gemini-cli",
    provider: "google",
    runtime: "google-gemini-cli",
    cli: true,
    requiresRuntimePolicy: true,
  },
] as const satisfies readonly LegacyRuntimeModelProviderAlias[];

function normalizeLegacyRuntimeProviderId(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  return normalized === "anthropic-cli" ? "claude-cli" : normalizeProviderId(normalized);
}

const LEGACY_ALIAS_BY_PROVIDER = new Map(
  LEGACY_RUNTIME_MODEL_PROVIDER_ALIASES.map((entry) => [
    normalizeLegacyRuntimeProviderId(entry.legacyProvider),
    entry,
  ]),
);

export function listLegacyRuntimeModelProviderAliases(): readonly LegacyRuntimeModelProviderAlias[] {
  return LEGACY_RUNTIME_MODEL_PROVIDER_ALIASES;
}

export function legacyRuntimeModelAliasRequiresRuntimePolicy(provider: string): boolean {
  return (
    LEGACY_ALIAS_BY_PROVIDER.get(normalizeLegacyRuntimeProviderId(provider))
      ?.requiresRuntimePolicy === true
  );
}

function resolveLegacyRuntimeModelProviderAlias(
  provider: string,
): LegacyRuntimeModelProviderAlias | undefined {
  return LEGACY_ALIAS_BY_PROVIDER.get(normalizeLegacyRuntimeProviderId(provider));
}

export function migrateLegacyRuntimeModelRef(raw: string): {
  ref: string;
  legacyProvider: string;
  provider: string;
  model: string;
  runtime: string;
  cli: boolean;
} | null {
  const trimmed = raw.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash >= trimmed.length - 1) {
    return null;
  }
  const alias = resolveLegacyRuntimeModelProviderAlias(trimmed.slice(0, slash));
  if (!alias) {
    return null;
  }
  const rawModel = trimmed.slice(slash + 1).trim();
  const model = normalizeStaticProviderModelId(alias.provider, rawModel) as string | null | undefined;
  if (!model) {
    return null;
  }
  return {
    ref: `${alias.provider}/${model}`,
    legacyProvider: alias.legacyProvider,
    provider: alias.provider,
    model,
    runtime: alias.runtime,
    cli: alias.cli,
  };
}
