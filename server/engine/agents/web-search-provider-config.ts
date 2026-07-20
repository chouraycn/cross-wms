/**
 * Provider-scoped web-search config helpers.
 * Ported from openclaw/src/agents/tools/web-search-provider-config.ts
 *
 * Bridges legacy top-level credentials with plugin-owned provider configuration.
 */

/** Reads the legacy top-level web search credential value. */
export function getTopLevelCredentialValue(searchConfig?: Record<string, unknown>): unknown {
  return searchConfig?.apiKey;
}

/** Writes the legacy top-level web search credential value. */
export function setTopLevelCredentialValue(
  searchConfigTarget: Record<string, unknown>,
  value: unknown,
): void {
  searchConfigTarget.apiKey = value;
}

/** Reads a provider-scoped credential value from a web search config object. */
export function getScopedCredentialValue(
  searchConfig: Record<string, unknown> | undefined,
  key: string,
): unknown {
  const scoped = searchConfig?.[key];
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
    return undefined;
  }
  return (scoped as Record<string, unknown>).apiKey;
}

/** Writes a provider-scoped credential value, creating the scoped object when needed. */
export function setScopedCredentialValue(
  searchConfigTarget: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const scoped = searchConfigTarget[key];
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
    searchConfigTarget[key] = { apiKey: value };
    return;
  }
  (scoped as Record<string, unknown>).apiKey = value;
}

/** Merges plugin web-search config into a provider-scoped legacy-compatible shape. */
export function mergeScopedSearchConfig(
  searchConfig: Record<string, unknown> | undefined,
  key: string,
  pluginConfig: Record<string, unknown> | undefined,
  options?: { mirrorApiKeyToTopLevel?: boolean },
): Record<string, unknown> | undefined {
  if (!pluginConfig) {
    return searchConfig;
  }

  const currentScoped =
    searchConfig?.[key] &&
    typeof searchConfig[key] === "object" &&
    !Array.isArray(searchConfig[key])
      ? (searchConfig[key] as Record<string, unknown>)
      : {};
  const next: Record<string, unknown> = { ...searchConfig };
  const existingDescriptor = searchConfig
    ? Object.getOwnPropertyDescriptor(searchConfig, key)
    : undefined;
  const shouldHideRuntimeInjectedLegacyShape =
    isLegacyWebSearchProviderConfigKey(key) && existingDescriptor === undefined;

  // Runtime-injected legacy provider keys should be addressable but absent from JSON writes.
  Object.defineProperty(next, key, {
    value: {
      ...currentScoped,
      ...pluginConfig,
    },
    enumerable: !shouldHideRuntimeInjectedLegacyShape,
    configurable: true,
    writable: true,
  });

  if (options?.mirrorApiKeyToTopLevel && pluginConfig.apiKey !== undefined) {
    next.apiKey = pluginConfig.apiKey;
  }

  return next;
}

const LEGACY_WEB_SEARCH_PROVIDER_CONFIG_KEYS = new Set([
  "brave",
  "google",
  "bing",
  "perplexity",
  "serpapi",
  "serper",
  "tavily",
  "searxng",
]);

/** Check if a key is a legacy web-search provider config key. */
function isLegacyWebSearchProviderConfigKey(key: string): boolean {
  return LEGACY_WEB_SEARCH_PROVIDER_CONFIG_KEYS.has(key);
}

/** Resolves plugin-owned web-search config for a provider plugin id. */
export function resolveProviderWebSearchPluginConfig(
  config: Record<string, unknown> | undefined,
  pluginId: string,
): Record<string, unknown> | undefined {
  if (!config) {
    return undefined;
  }
  const plugins = config.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) {
    return undefined;
  }
  const entries = (plugins as Record<string, unknown>).entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return undefined;
  }
  const entry = (entries as Record<string, unknown>)[pluginId];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }
  const entryConfig = (entry as Record<string, unknown>).config;
  if (!entryConfig || typeof entryConfig !== "object" || Array.isArray(entryConfig)) {
    return undefined;
  }
  return (entryConfig as Record<string, unknown>).webSearch as Record<string, unknown> | undefined;
}

function ensureObject(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = target[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

/** Writes a single plugin-owned web-search config value and enables the plugin entry if needed. */
export function setProviderWebSearchPluginConfigValue(
  configTarget: Record<string, unknown>,
  pluginId: string,
  key: string,
  value: unknown,
): void {
  const plugins = ensureObject(configTarget, "plugins");
  const entries = ensureObject(plugins, "entries");
  const entry = ensureObject(entries, pluginId);
  if (entry.enabled === undefined) {
    entry.enabled = true;
  }
  const config = ensureObject(entry, "config");
  const webSearch = ensureObject(config, "webSearch");
  webSearch[key] = value;
}
