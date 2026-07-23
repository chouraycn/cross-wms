/**
 * Determines which manifest contracts are eligible for plugin activation.
 *
 * 移植自 openclaw/src/plugins/manifest-contract-eligibility.ts。
 *
 * 降级策略：原文件依赖 @openclaw/normalization-core/string-normalization、
 * ../config/types.openclaw.js、./installed-plugin-index.js、./manifest-registry.js、
 * ./plugin-metadata-snapshot.js。所有运行时函数降级为返回默认值或抛出错误。
 */

/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;

/** 占位：PluginManifestContractListKey。 */
type PluginManifestContractListKey = string;

/** 占位：PluginManifestRecord。 */
type PluginManifestRecord = {
  id: string;
  origin?: string;
  enabledByDefault?: boolean;
  enabledByDefaultOnPlatforms?: string[];
  contracts?: Partial<Record<PluginManifestContractListKey, string[]>>;
  channels?: string[];
};

/** 占位：PluginMetadataSnapshot。 */
type PluginMetadataSnapshot = {
  index: unknown;
  plugins: PluginManifestRecord[];
  manifestRegistry?: unknown;
};

/** 占位：PluginMetadataManifestView。 */
type PluginMetadataManifestView = {
  index: unknown;
  plugins: PluginManifestRecord[];
};

/** 占位：PluginMetadataRegistryView。 */
type PluginMetadataRegistryView = {
  index: unknown;
  manifestRegistry: unknown;
};

export function isManifestPluginAvailableForControlPlane(params: {
  snapshot: Pick<PluginMetadataSnapshot, "index">;
  plugin: Pick<PluginManifestRecord, "id" | "origin" | "enabledByDefault" | "enabledByDefaultOnPlatforms">;
  config?: OpenClawConfig;
}): boolean {
  if (params.plugin.origin === "bundled") {
    return true;
  }
  return false;
}

export function hasManifestContractValue(params: {
  plugin: Pick<PluginManifestRecord, "contracts">;
  contract: PluginManifestContractListKey;
  value?: string;
}): boolean {
  const values = params.plugin.contracts?.[params.contract] ?? [];
  return values.length > 0 && (!params.value || values.includes(params.value));
}

export function listAvailableManifestContractPlugins(params: {
  snapshot: Pick<PluginMetadataSnapshot, "index" | "plugins">;
  contract: PluginManifestContractListKey;
  value?: string;
  config?: OpenClawConfig;
}): PluginManifestRecord[] {
  return params.snapshot.plugins.filter((plugin) =>
    hasManifestContractValue({ plugin, contract: params.contract, value: params.value }),
  );
}

export function listAvailableManifestContractValues(params: {
  snapshot: Pick<PluginMetadataSnapshot, "index" | "plugins">;
  contract: PluginManifestContractListKey;
  config?: OpenClawConfig;
}): string[] {
  const values = new Set<string>();
  for (const plugin of listAvailableManifestContractPlugins(params)) {
    for (const value of plugin.contracts?.[params.contract] ?? []) {
      values.add(value);
    }
  }
  return [...values].sort();
}

export function loadManifestContractSnapshot(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): PluginMetadataManifestView {
  void params;
  return { index: undefined, plugins: [] };
}

export function loadManifestMetadataRegistry(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): PluginMetadataRegistryView {
  void params;
  return { index: undefined, manifestRegistry: undefined };
}

export function loadManifestMetadataSnapshot(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): PluginMetadataSnapshot {
  void params;
  return { index: undefined, plugins: [] };
}
