/**
 * Provider-scoped web-search config helpers.
 * Ported from openclaw/src/agents/tools/web-search-provider-config.ts
 *
 * Bridges legacy top-level credentials with plugin-owned provider configuration.
 */

/** Reads the legacy top-level web search credential value. */
export function getTopLevelCredentialValue(searchConfig?: Record<string, any>): any {
  return searchConfig?.apiKey;
}

/** Writes the legacy top-level web search credential value. */
export function setTopLevelCredentialValue(
  searchConfigTarget: Record<string, any>,
  value: any,
): void {
  searchConfigTarget.apiKey = value;
}

/** Reads a provider-scoped credential value from a web search config object. */
export function getScopedCredentialValue(
  searchConfig: Record<string, any> | undefined,
  key: string,
): any {
  const scoped = searchConfig?.[key];
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
    return undefined;
  }
  return (scoped as Record<string, any>).apiKey;
}

/** Writes a provider-scoped credential value, creating the scoped object when needed. */
export function setScopedCredentialValue(
  searchConfigTarget: Record<string, any>,
  key: string,
  value: any,
): void {
  const scoped = searchConfigTarget[key];
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
    searchConfigTarget[key] = { apiKey: value };
    return;
  }
  (scoped as Record<string, any>).apiKey = value;
}

/** Merges plugin web-search config into a provider-scoped legacy-compatible shape. */
export function mergeScopedSearchConfig(
  searchConfig: Record<string, any> | undefined,
  key: string,
  pluginConfig: Record<string, any> | undefined,
  options?: { mirrorApiKeyToTopLevel?: boolean },
): Record<string, any> | undefined {
  if (!pluginConfig) {
    return searchConfig;
  }

  const currentScoped =
    searchConfig?.[key] &&
    typeof searchConfig[key] === "object" &&
    !Array.isArray(searchConfig[key])
      ? (searchConfig[key] as Record<string, any>)
      : {};
  const next: Record<string, any> = { ...searchConfig };
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
  config: Record<string, any> | undefined,
  pluginId: string,
): Record<string, any> | undefined {
  if (!config) {
    return undefined;
  }
  const plugins = config.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) {
    return undefined;
  }
  const entries = (plugins as Record<string, any>).entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return undefined;
  }
  const entry = (entries as Record<string, any>)[pluginId];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }
  const entryConfig = (entry as Record<string, any>).config;
  if (!entryConfig || typeof entryConfig !== "object" || Array.isArray(entryConfig)) {
    return undefined;
  }
  return (entryConfig as Record<string, any>).webSearch as Record<string, any> | undefined;
}

function ensureObject(target: Record<string, any>, key: string): Record<string, any> {
  const current = target[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, any>;
  }
  const next: Record<string, any> = {};
  target[key] = next;
  return next;
}

/** Writes a single plugin-owned web-search config value and enables the plugin entry if needed. */
export function setProviderWebSearchPluginConfigValue(
  configTarget: Record<string, any>,
  pluginId: string,
  key: string,
  value: any,
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
