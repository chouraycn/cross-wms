/**
 * Normalizes plugin registry identifiers from installed index records.
 * 移植自 openclaw/src/plugins/plugin-registry-id-normalizer.ts。
 * 降级策略：
 *  - InstalledPluginIndex 复用已移植类型。
 *  - manifest-registry-installed.ts 未移植，loadPluginManifestRegistryForInstalledIndex
 *    降级为返回空注册表 { plugins: [], diagnostics: [] }。
 *  - PluginManifestRecord / PluginManifestRegistry 复用 manifest-registry.ts 已有类型。
 */
import type { InstalledPluginIndex } from "./installed-plugin-index-types.js";
import type {
  PluginManifestRecord,
  PluginManifestRegistry,
} from "./manifest-registry.js";

/** 占位：为已安装索引加载 manifest 注册表（manifest-registry-installed.ts 未移植）。 */
function loadPluginManifestRegistryForInstalledIndex(_params: {
  index: InstalledPluginIndex;
  includeDisabled?: boolean;
}): PluginManifestRegistry {
  return { plugins: [], diagnostics: [] } as unknown as PluginManifestRegistry;
}

/** Inputs used to resolve aliases for installed plugin ids. */
export type PluginRegistryIdNormalizerOptions = {
  manifestRegistry?: PluginManifestRegistry;
  lookUpTable?: Pick<{ manifestRegistry: PluginManifestRegistry }, "manifestRegistry">;
};

function normalizePluginRegistryAlias(value: string): string {
  return value.trim();
}

function normalizePluginRegistryAliasKey(value: string): string {
  return normalizePluginRegistryAlias(value).toLowerCase();
}

function collectObjectKeys(value: Record<string, unknown> | undefined): readonly string[] {
  return value ? Object.keys(value) : [];
}

function listPluginRegistryNormalizerAliases(plugin: PluginManifestRecord): readonly string[] {
  const p = plugin as Record<string, unknown>;
  const providers = Array.isArray(p.providers) ? p.providers : [];
  const channels = Array.isArray(p.channels) ? p.channels : [];
  const cliBackends = Array.isArray(p.cliBackends) ? p.cliBackends : [];
  const legacyPluginIds = Array.isArray(p.legacyPluginIds) ? p.legacyPluginIds : [];
  const setup = p.setup as
    | { providers?: Array<{ id?: string }>; cliBackends?: readonly string[] }
    | undefined;
  const setupProviderIds = setup?.providers?.map((provider) => provider.id).filter(Boolean) ?? [];
  const setupCliBackends = setup?.cliBackends ?? [];
  const modelCatalog = p.modelCatalog as
    | { providers?: Record<string, unknown>; aliases?: Record<string, unknown> }
    | undefined;
  const providerAuthAliases = p.providerAuthAliases as Record<string, unknown> | undefined;
  return [
    String(p.id ?? ""),
    ...(providers as readonly string[]),
    ...(channels as readonly string[]),
    ...(setupProviderIds as string[]),
    ...(cliBackends as readonly string[]),
    ...(setupCliBackends as readonly string[]),
    ...collectObjectKeys(modelCatalog?.providers),
    ...collectObjectKeys(modelCatalog?.aliases),
    ...collectObjectKeys(providerAuthAliases),
    ...(legacyPluginIds as readonly string[]),
  ];
}

/** Creates a normalizer that maps provider/channel/catalog aliases back to plugin ids. */
export function createPluginRegistryIdNormalizer(
  index: InstalledPluginIndex,
  options: PluginRegistryIdNormalizerOptions = {},
): (pluginId: string) => string {
  const aliases = new Map<string, string>();
  const plugins = (index as unknown as { plugins?: Array<{ pluginId?: string }> }).plugins ?? [];
  for (const plugin of plugins) {
    if (!plugin.pluginId) {
      continue;
    }
    const pluginId = normalizePluginRegistryAlias(plugin.pluginId);
    if (pluginId) {
      aliases.set(normalizePluginRegistryAliasKey(pluginId), plugin.pluginId);
    }
  }
  const registry =
    options.lookUpTable?.manifestRegistry ??
    options.manifestRegistry ??
    loadPluginManifestRegistryForInstalledIndex({
      index,
      includeDisabled: true,
    });
  const registryPlugins =
    (registry as unknown as { plugins?: PluginManifestRecord[] }).plugins ?? [];
  for (const plugin of [...registryPlugins].toSorted((left, right) =>
    String(left.id).localeCompare(String(right.id)),
  )) {
    const pluginId = normalizePluginRegistryAlias(String(plugin.id ?? ""));
    if (!pluginId) {
      continue;
    }
    aliases.set(normalizePluginRegistryAliasKey(pluginId), String(plugin.id));
    for (const alias of listPluginRegistryNormalizerAliases(plugin)) {
      const normalizedAlias = normalizePluginRegistryAlias(alias);
      const normalizedAliasKey = normalizePluginRegistryAliasKey(alias);
      if (normalizedAlias && !aliases.has(normalizedAliasKey)) {
        aliases.set(normalizedAliasKey, pluginId);
      }
    }
  }
  return (pluginId: string) => {
    const trimmed = normalizePluginRegistryAlias(pluginId);
    return aliases.get(normalizePluginRegistryAliasKey(trimmed)) ?? trimmed;
  };
}
