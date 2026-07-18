/** Resolves enabled bundled plugins that advertise a specific manifest contract list. */
//
// 移植自 openclaw/src/plugins/bundled-manifest-contract-plugins.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/types.openclaw.js 的 OpenClawConfig。cross-wms 尚未
//    移植完整配置类型层级。这里定义本地宽松结构占位（与 bundled-compat.ts
//    中占位一致）。
//  - 原文件依赖 ./activation-context.js 的 resolveBundledPluginCompatibleLoadValues
//    与 PluginActivationBundledCompatMode。cross-wms 尚未移植该模块。这里降级为：
//    resolveBundledPluginCompatibleLoadValues 返回空 activation 结果（config=入参、
//    activationSourceConfig=入参、compatPluginIds=[]）。
//  - 原文件依赖 ./config-state.js 的 createPluginActivationSource、normalizePluginsConfig
//    与 resolveEffectivePluginActivationState。cross-wms 尚未移植该模块。这里降级为：
//    createPluginActivationSource 返回 undefined；normalizePluginsConfig 返回空结构；
//    resolveEffectivePluginActivationState 返回 { enabled: true }。
//  - 原文件依赖 ./default-enablement.js 的 isPluginEnabledByDefaultForPlatform。
//    cross-wms 已移植该模块，直接引用。
//  - 原文件依赖 ./manifest-contract-eligibility.js 的 loadManifestContractSnapshot。
//    cross-wms 尚未移植该模块。这里降级为始终返回空快照（{ plugins: [] }）。
//  - 原文件依赖 ./manifest-registry.js 的 PluginManifestContractListKey 与
//    PluginManifestRecord。cross-wms 尚未移植该模块。这里定义本地最小结构占位。
//  - 行为契约保持一致：当 cross-wms 未来移植 activation-context、config-state、
//    manifest-contract-eligibility 与 manifest-registry 时，可直接替换本地降级实现。

import { isPluginEnabledByDefaultForPlatform } from "./default-enablement.js";

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足 bundled-manifest-contract-plugins 对 plugins 字段的访问。
 */
type OpenClawConfig = {
  plugins?: {
    enabled?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * 插件 manifest 合同列表键（降级 string 别名占位）。
 *
 * 降级原因：cross-wms 的 manifest-registry.js 尚未移植。
 */
type PluginManifestContractListKey = string;

/**
 * 插件 manifest 记录的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest-registry.js 尚未移植。仅保留
 * bundled-manifest-contract-plugins 实际访问的字段
 * (id/origin/contracts)。
 */
type PluginManifestRecord = {
  id: string;
  origin?: string;
  contracts?: Partial<Record<PluginManifestContractListKey, readonly string[]>>;
};

/**
 * 插件 activation 兼容模式（降级 string 别名占位）。
 *
 * 降级原因：cross-wms 的 activation-context.js 尚未移植。
 */
type PluginActivationBundledCompatMode = string;

// ============================================================================
// 内联降级：./activation-context.js —— resolveBundledPluginCompatibleLoadValues
// ============================================================================

type BundledPluginCompatibleLoadResult = {
  config?: OpenClawConfig;
  activationSourceConfig?: OpenClawConfig;
  compatPluginIds?: readonly string[];
};

/**
 * 解析 bundled 插件兼容加载值（降级占位）。
 *
 * 降级说明：cross-wms 的 activation-context.js 尚未移植。openclaw 原版根据
 * compatMode 与 resolveCompatPluginIds 解析兼容插件 ID 集合。这里降级为
 * 直接调用 resolveCompatPluginIds 并返回其结果，不应用 auto-enable。
 */
function resolveBundledPluginCompatibleLoadValues(params: {
  rawConfig?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  onlyPluginIds?: readonly string[];
  applyAutoEnable?: boolean;
  compatMode: PluginActivationBundledCompatMode;
  resolveCompatPluginIds: (compatParams: {
    config?: OpenClawConfig;
    onlyPluginIds?: readonly string[];
  }) => readonly string[];
}): BundledPluginCompatibleLoadResult {
  const compatPluginIds = params.resolveCompatPluginIds({
    config: params.rawConfig,
    onlyPluginIds: params.onlyPluginIds,
  });
  return {
    config: params.rawConfig,
    activationSourceConfig: params.rawConfig,
    compatPluginIds,
  };
}

// ============================================================================
// 内联降级：./config-state.js —— createPluginActivationSource /
// normalizePluginsConfig / resolveEffectivePluginActivationState
// ============================================================================

type NormalizedPluginsConfig = {
  enabled: boolean;
  entries: Record<string, { enabled?: boolean }>;
  allow: readonly string[];
  deny: readonly string[];
  loadPaths: readonly string[];
};

type PluginActivationSource = unknown;

/**
 * 创建插件 activation 来源（降级占位）。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。openclaw 原版根据 config
 * 构建 activation 来源记录。这里降级为始终返回 undefined（无 activation 来源）。
 */
function createPluginActivationSource(_params: { config?: OpenClawConfig }): PluginActivationSource {
  return undefined;
}

function normalizePluginsConfig(_plugins: unknown): NormalizedPluginsConfig {
  return {
    enabled: true,
    entries: {},
    allow: [],
    deny: [],
    loadPaths: [],
  };
}

type EffectivePluginActivationState = {
  enabled: boolean;
  explicitlyEnabled?: boolean;
};

function resolveEffectivePluginActivationState(_params: {
  id: string;
  origin: string;
  config: NormalizedPluginsConfig;
  rootConfig?: OpenClawConfig;
  enabledByDefault?: boolean;
  activationSource?: PluginActivationSource;
}): EffectivePluginActivationState {
  return { enabled: true };
}

// ============================================================================
// 内联降级：./manifest-contract-eligibility.js —— loadManifestContractSnapshot
// ============================================================================

type ManifestContractSnapshot = {
  plugins: readonly PluginManifestRecord[];
};

/**
 * 加载 manifest 合同快照（降级占位）。
 *
 * 降级说明：cross-wms 的 manifest-contract-eligibility.js 尚未移植。openclaw
 * 原版根据 config/workspaceDir/env 解析启用的 bundled 插件 manifest 记录。
 * 这里降级为始终返回空快照。
 */
function loadManifestContractSnapshot(_params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): ManifestContractSnapshot {
  return { plugins: [] };
}

// ============================================================================
// bundled-manifest-contract-plugins 实现
// ============================================================================

function createPluginIdSet(pluginIds: readonly string[] | undefined): Set<string> | null {
  return pluginIds && pluginIds.length > 0 ? new Set(pluginIds) : null;
}

/** Lists bundled plugin ids with a non-empty contract contribution in a manifest snapshot. */
export function listBundledManifestContractPluginIds(params: {
  plugins: readonly PluginManifestRecord[];
  contract: PluginManifestContractListKey;
  onlyPluginIds?: readonly string[];
}): string[] {
  const onlyPluginIdSet = createPluginIdSet(params.onlyPluginIds);
  return params.plugins
    .filter(
      (plugin) =>
        plugin.origin === "bundled" &&
        (!onlyPluginIdSet || onlyPluginIdSet.has(plugin.id)) &&
        (plugin.contracts?.[params.contract]?.length ?? 0) > 0,
    )
    .map((plugin) => plugin.id)
    .toSorted((left, right) => left.localeCompare(right));
}

/** Applies config activation and compatibility rules before returning bundled contract owners. */
export function resolveEnabledBundledManifestContractPlugins(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  onlyPluginIds?: readonly string[];
  contract: PluginManifestContractListKey;
  compatMode: PluginActivationBundledCompatMode;
}): PluginManifestRecord[] {
  if (params.config?.plugins?.enabled === false) {
    return [];
  }
  let manifestRecords: readonly PluginManifestRecord[] | undefined;
  const loadManifestRecords = (config?: OpenClawConfig) => {
    manifestRecords ??= loadManifestContractSnapshot({
      config,
      workspaceDir: params.workspaceDir,
      env: params.env,
    }).plugins;
    return manifestRecords;
  };

  const activation = resolveBundledPluginCompatibleLoadValues({
    rawConfig: params.config,
    env: params.env,
    workspaceDir: params.workspaceDir,
    onlyPluginIds: params.onlyPluginIds,
    applyAutoEnable: true,
    compatMode: params.compatMode,
    resolveCompatPluginIds: (compatParams) =>
      listBundledManifestContractPluginIds({
        plugins: loadManifestRecords(compatParams.config),
        contract: params.contract,
        onlyPluginIds: compatParams.onlyPluginIds,
      }),
  });
  const normalizedPlugins = normalizePluginsConfig(activation.config?.plugins);
  const activationSource = createPluginActivationSource({
    config: activation.activationSourceConfig,
  });
  const onlyPluginIdSet = createPluginIdSet(params.onlyPluginIds);
  return loadManifestRecords(activation.config).filter((plugin) => {
    if (
      plugin.origin !== "bundled" ||
      (onlyPluginIdSet && !onlyPluginIdSet.has(plugin.id)) ||
      (plugin.contracts?.[params.contract]?.length ?? 0) === 0
    ) {
      return false;
    }
    return resolveEffectivePluginActivationState({
      id: plugin.id,
      origin: plugin.origin ?? "unknown",
      config: normalizedPlugins,
      rootConfig: activation.config,
      enabledByDefault: isPluginEnabledByDefaultForPlatform(plugin as never),
      activationSource,
    }).enabled;
  });
}
