/**
 * 移植自 openclaw/src/agents/model-catalog-visibility.ts
 *
 * Resolves model catalog entries visible to browse/UI surfaces.
 * cross-wms provides simplified implementations since the full model catalog
 * and provider auth infrastructure is not available.
 */

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_CODEX_RESPONSES_API = "openai-chatgpt-responses";
const OPENAI_CODEX_ROUTABLE_MODEL_IDS = new Set([
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-codex",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
]);

/** Check if a catalog entry is a Codex-routable OpenAI platform entry. */
export function isCodexRoutableOpenAIPlatformCatalogEntry(entry: {
  provider: string;
  api?: string;
  id: string;
}): boolean {
  return (
    entry.provider.trim().toLowerCase() === OPENAI_PROVIDER_ID &&
    entry.api !== undefined &&
    entry.api !== OPENAI_CODEX_RESPONSES_API &&
    OPENAI_CODEX_ROUTABLE_MODEL_IDS.has(entry.id.trim().toLowerCase())
  );
}

/**
 * Resolve catalog entries visible for one view.
 * In cross-wms this returns the full catalog since provider auth checking
 * is not available.
 */
export async function resolveVisibleModelCatalog(params: {
  cfg?: unknown;
  catalog: Array<{ provider: string; id: string; [key: string]: unknown }>;
  defaultProvider: string;
  defaultModel?: string;
  agentDir?: string;
  agentId?: string;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  view?: "default" | "configured" | "all";
  runtimeAuthDiscovery?: boolean;
  providerAuthChecker?: (provider: string, modelApi?: string) => boolean | Promise<boolean>;
}): Promise<Array<{ provider: string; id: string; [key: string]: unknown }>> {
  if (params.view === "all") {
    return params.catalog;
  }

  // cross-wms lacks model visibility policy and provider auth checking.
  // Return the catalog sorted by provider and model id.
  return params.catalog.toSorted(
    (a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id),
  );
}
