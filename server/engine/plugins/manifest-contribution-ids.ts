/** Lists manifest contribution ids from installed plugin registry snapshots. */
//
// 移植自 openclaw/src/plugins/manifest-contribution-ids.ts。
//
// 降级策略：
//  - 原文件依赖 ./plugin-registry.js 的 listPluginContributionIds、
//    loadPluginRegistrySnapshot、LoadPluginRegistryParams、PluginRegistryContributionKey、
//    PluginRegistrySnapshot。cross-wms 尚未移植该模块。这里降级为：
//    1. 定义本地最小结构占位类型（仅含 listManifestContributionIds 实际访问的字段）。
//    2. loadPluginRegistrySnapshot 降级为返回空快照（plugins 为空数组）。
//    3. listPluginContributionIds 降级为遍历空快照的 plugins，返回空数组。
//  - 行为契约保持一致：当 cross-wms 未来移植 plugin-registry.js 时，可直接替换
//    本地降级实现，调用方无需修改。

// ============================================================================
// 内联降级类型占位：./plugin-registry.js
// ============================================================================

/**
 * 插件注册表贡献键（降级占位）。
 *
 * 降级原因：cross-wms 的 plugin-registry.js 尚未移植。这里定义与 openclaw
 * PluginRegistryContributionKey 兼容的联合类型字面量。
 */
export type PluginRegistryContributionKey =
  | "channels"
  | "providers"
  | "modelCatalogProviders"
  | "commandAliases"
  | "contracts"
  | "tools"
  | "skills";

/**
 * 插件注册表快照（降级占位）。
 *
 * 降级原因：cross-wms 的 plugin-registry.js 尚未移植。这里定义与 openclaw
 * PluginRegistrySnapshot 结构兼容的最小类型，仅含 listPluginContributionIds
 * 实际访问的 plugins 字段。
 */
export type PluginRegistrySnapshot = {
  plugins: ReadonlyArray<{
    pluginId: string;
    enabled: boolean;
    contributions?: Partial<Record<PluginRegistryContributionKey, readonly string[]>>;
  }>;
};

/** 加载插件注册表快照的参数（降级占位）。 */
export type LoadPluginRegistryParams = {
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  candidates?: readonly unknown[];
  preferPersisted?: boolean;
};

/**
 * 加载插件注册表快照（降级占位）。
 *
 * 降级说明：cross-wms 的 plugin-registry.js 尚未移植。这里降级为始终返回
 * 空快照（plugins 为空数组）。当未来移植 plugin-registry.js 时应替换为真实实现。
 */
function loadPluginRegistrySnapshot(
  _params: LoadPluginRegistryParams = {},
): PluginRegistrySnapshot {
  return { plugins: [] };
}

/**
 * 列出插件注册表中指定贡献键的贡献 id（降级占位）。
 *
 * 降级说明：cross-wms 的 plugin-registry.js 尚未移植。这里降级为遍历快照中
 * 启用的插件的 contributions[contribution] 字段，去重后排序返回。
 */
function listPluginContributionIds(params: {
  index: PluginRegistrySnapshot;
  contribution: PluginRegistryContributionKey;
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  includeDisabled?: boolean;
}): readonly string[] {
  const result = new Set<string>();
  for (const plugin of params.index.plugins) {
    if (!params.includeDisabled && !plugin.enabled) {
      continue;
    }
    const contributionList = plugin.contributions?.[params.contribution];
    if (!contributionList) {
      continue;
    }
    for (const id of contributionList) {
      result.add(id);
    }
  }
  return [...result].sort((left, right) => left.localeCompare(right));
}

// ============================================================================
// manifest-contribution-ids 实现
// ============================================================================

/** Parameters for listing manifest contribution ids from a registry snapshot. */
export type ListManifestContributionIdsParams = LoadPluginRegistryParams & {
  contribution: PluginRegistryContributionKey;
  index?: PluginRegistrySnapshot;
  includeDisabled?: boolean;
};

/** Lists ids contributed by plugin manifests for one contribution kind. */
export function listManifestContributionIds(
  params: ListManifestContributionIdsParams,
): readonly string[] {
  const env = params.env ?? process.env;
  const index =
    params.index ??
    loadPluginRegistrySnapshot({
      config: params.config,
      workspaceDir: params.workspaceDir,
      env,
      candidates: params.candidates,
      preferPersisted: params.preferPersisted,
    });
  return listPluginContributionIds({
    index,
    contribution: params.contribution,
    config: params.config,
    workspaceDir: params.workspaceDir,
    env,
    includeDisabled: params.includeDisabled,
  });
}

/** Lists channel ids contributed by plugin manifests. */
export function listManifestChannelContributionIds(
  params: Omit<ListManifestContributionIdsParams, "contribution"> = {},
): readonly string[] {
  return listManifestContributionIds({
    ...params,
    contribution: "channels",
  });
}

/** Lists provider ids contributed by plugin manifests. */
export function listManifestProviderContributionIds(
  params: Omit<ListManifestContributionIdsParams, "contribution"> = {},
): readonly string[] {
  return listManifestContributionIds({
    ...params,
    contribution: "providers",
  });
}
