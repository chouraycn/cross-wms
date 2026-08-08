// Plugin config runtime helpers load and normalize plugin-owned configuration at execution time.
import type { OpenClawConfig } from "../config/types.js";

export { normalizePluginsConfig, resolveEffectiveEnableState } from "../plugins/config-state.js";

/** Requires an already-resolved runtime config at plugin runtime boundaries. */
export function requireRuntimeConfig(config: OpenClawConfig, context: string): OpenClawConfig {
  if (config) {
    return config;
  }
  throw new Error(
    `${context} requires a resolved runtime config. Load and resolve config at the command or gateway boundary, then pass cfg through the runtime path.`,
  );
}

/** Reads a plugin's object-shaped `plugins.entries[id].config` block from resolved config. */
export function resolvePluginConfigObject(
  config: OpenClawConfig | undefined,
  pluginId: string,
): Record<string, any> | undefined {
  const plugins =
    config?.plugins && typeof config.plugins === "object" && !Array.isArray(config.plugins)
      ? (config.plugins as Record<string, any>)
      : undefined;
  const entries =
    plugins?.entries && typeof plugins.entries === "object" && !Array.isArray(plugins.entries)
      ? (plugins.entries as Record<string, any>)
      : undefined;
  const entry = entries?.[pluginId];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }
  const pluginConfig = (entry as { config?: any }).config;
  return pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig)
    ? (pluginConfig as Record<string, any>)
    : undefined;
}

/** Resolves live plugin config through a loader, falling back to startup config when unavailable. */
export function resolveLivePluginConfigObject(
  runtimeConfigLoader: (() => OpenClawConfig | undefined) | undefined,
  pluginId: string,
  startupPluginConfig?: Record<string, any>,
): Record<string, any> | undefined {
  if (typeof runtimeConfigLoader !== "function") {
    return startupPluginConfig;
  }
  return resolvePluginConfigObject(runtimeConfigLoader(), pluginId);
}
