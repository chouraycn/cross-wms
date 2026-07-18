/** Public installed-plugin-index API for load, refresh, policy hash, and invalidation checks. */
//
// 移植自 openclaw/src/plugins/installed-plugin-index.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/types.js 的 OpenClawConfig。cross-wms 尚未移植完整配置
//    类型层级。这里定义本地宽松结构占位，与 installed-plugin-index-policy.ts 中
//    占位一致。
//  - 原文件依赖 ../version.js 的 resolveCompatibilityHostVersion。cross-wms 尚未
//    移植该模块。这里内联降级实现：从 env.OPENCLAW_HOST_VERSION 读取，回退到
//    "unknown"。
//  - 原文件依赖 ./config-state.js 的 normalizePluginsConfig 与
//    resolveEffectivePluginActivationState。cross-wms 尚未移植该模块。这里内联降级
//    实现：normalizePluginsConfig 返回空规范化结构（与 installed-plugin-index-record-builder.ts
//    中占位一致）；resolveEffectivePluginActivationState 返回 { enabled: true, explicitlyEnabled: false }。
//  - 原文件依赖 ./default-enablement.js 的 isPluginEnabledByDefaultForPlatform。
//    cross-wms 已移植该模块，直接引用。
//  - 原文件依赖 ./discovery.js 的 PluginDiscoveryResult。cross-wms 尚未移植该模块。
//    这里降级为 unknown 占位（与 installed-plugin-index-types.ts 一致）。
//  - 原文件依赖 ./installed-plugin-index-install-records.js 的 normalizeInstallRecordMap
//    与 extractPluginInstallRecordsFromInstalledPluginIndex。cross-wms 已移植该模块，
//    直接引用。
//  - 原文件依赖 ./installed-plugin-index-policy.js 的 resolveCompatRegistryVersion 与
//    resolveInstalledPluginIndexPolicyHash。cross-wms 已移植该模块，直接引用。
//  - 原文件依赖 ./installed-plugin-index-record-builder.js 的
//    buildInstalledPluginIndexRecords。cross-wms 已在本批移植中创建降级版，直接引用。
//  - 原文件依赖 ./installed-plugin-index-record-reader.js 的
//    loadInstalledPluginIndexInstallRecordsSync。cross-wms 已在本批移植中创建降级版，
//    直接引用。
//  - 原文件依赖 ./installed-plugin-index-registry.js 的
//    resolveInstalledPluginIndexRegistry。cross-wms 已在本批移植中创建降级版，直接引用。
//  - ./installed-plugin-index-types.js 在 cross-wms 中已存在，直接引用。
//  - 行为契约保持一致：当 cross-wms 未来移植 config-state.js、discovery.js、version.js
//    时，可直接替换本地降级实现。

import { isPluginEnabledByDefaultForPlatform } from "./default-enablement.js";
import {
  extractPluginInstallRecordsFromInstalledPluginIndex,
  normalizeInstallRecordMap,
} from "./installed-plugin-index-install-records.js";
import {
  resolveCompatRegistryVersion,
  resolveInstalledPluginIndexPolicyHash,
} from "./installed-plugin-index-policy.js";
import { buildInstalledPluginIndexRecords } from "./installed-plugin-index-record-builder.js";
import { loadInstalledPluginIndexInstallRecordsSync } from "./installed-plugin-index-record-reader.js";
import { resolveInstalledPluginIndexRegistry } from "./installed-plugin-index-registry.js";
import {
  INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
  INSTALLED_PLUGIN_INDEX_VERSION,
  INSTALLED_PLUGIN_INDEX_WARNING,
  type InstalledPluginIndex,
  type InstalledPluginIndexRecord,
  type InstalledPluginIndexRefreshReason,
  type LoadInstalledPluginIndexParams,
  type RefreshInstalledPluginIndexParams,
} from "./installed-plugin-index-types.js";

export {
  INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
  INSTALLED_PLUGIN_INDEX_VERSION,
  INSTALLED_PLUGIN_INDEX_WARNING,
} from "./installed-plugin-index-types.js";
export type {
  InstalledPluginIndex,
  InstalledPluginIndexRecord,
  InstalledPluginIndexRefreshReason,
  InstalledPluginInstallRecordInfo,
  InstalledPluginPackageChannelInfo,
  InstalledPluginStartupInfo,
  LoadInstalledPluginIndexParams,
  RefreshInstalledPluginIndexParams,
} from "./installed-plugin-index-types.js";
export { extractPluginInstallRecordsFromInstalledPluginIndex } from "./installed-plugin-index-install-records.js";
export { diffInstalledPluginIndexInvalidationReasons } from "./installed-plugin-index-invalidation.js";
export {
  CONFIG_PATH_ACTIVATION_COMPAT_CODE,
  hasMissingConfigPathActivationMetadata,
} from "./installed-plugin-index-config-path-scope.js";
export { resolveInstalledPluginIndexPolicyHash } from "./installed-plugin-index-policy.js";

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足 installed-plugin-index 对 config 字段的访问。
 */
type OpenClawConfig = {
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>;
    [key: string]: unknown;
  };
  channels?: Record<string, unknown>;
  [key: string]: unknown;
};

/** 插件发现结果（降级 unknown 占位）。 */
type PluginDiscoveryResult = unknown;

// ============================================================================
// 内联降级：../version.js —— resolveCompatibilityHostVersion
// ============================================================================

/**
 * 解析兼容性宿主版本（降级占位）。
 *
 * 降级说明：cross-wms 的 version.js 尚未移植。openclaw 原版从 package.json
 * 读取版本号。这里降级为从 env.OPENCLAW_HOST_VERSION 读取，回退到 "unknown"。
 */
function resolveCompatibilityHostVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv =
    typeof env.OPENCLAW_HOST_VERSION === "string" ? env.OPENCLAW_HOST_VERSION.trim() : "";
  return fromEnv || "unknown";
}

// ============================================================================
// 内联降级：./config-state.js —— normalizePluginsConfig 与 resolveEffectivePluginActivationState
// ============================================================================

type NormalizedPluginsConfig = {
  enabled: boolean;
  entries: Record<string, { enabled?: boolean }>;
  allow: readonly string[];
  deny: readonly string[];
  loadPaths: readonly string[];
};

/**
 * 规范化插件配置（降级占位）。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。这里降级为始终返回空规范化
 * 结构，使所有插件默认通过 base policy。
 */
function normalizePluginsConfig(_plugins: unknown): NormalizedPluginsConfig {
  return {
    enabled: true,
    entries: {},
    allow: [],
    deny: [],
    loadPaths: [],
  };
}

type PluginActivationState = {
  enabled: boolean;
  explicitlyEnabled?: boolean;
  activated?: boolean;
};

/**
 * 解析插件有效激活状态（降级占位）。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。这里降级为始终返回
 * { enabled: true, explicitlyEnabled: false, activated: true }。
 */
function resolveEffectivePluginActivationState(_params: {
  id: string;
  origin: string;
  config: NormalizedPluginsConfig;
  rootConfig?: OpenClawConfig;
  enabledByDefault?: boolean;
  autoEnabledReason?: string;
}): PluginActivationState {
  return {
    enabled: true,
    explicitlyEnabled: false,
    activated: true,
  };
}

// ============================================================================
// installed-plugin-index 实现
// ============================================================================

function buildInstalledPluginIndex(
  params: LoadInstalledPluginIndexParams & { refreshReason?: InstalledPluginIndexRefreshReason },
): { index: InstalledPluginIndex; discovery: PluginDiscoveryResult | undefined } {
  const env = params.env ?? process.env;
  const { candidates, registry, discovery } = resolveInstalledPluginIndexRegistry(params);
  const registryDiagnostics = (registry as { diagnostics?: readonly PluginDiagnostic[] }).diagnostics ?? [];
  const diagnostics: PluginDiagnostic[] = [...registryDiagnostics];
  const generatedAtMs = (params.now?.() ?? new Date()).getTime();
  const installRecords = normalizeInstallRecordMap(
    (params.installRecords ??
      loadInstalledPluginIndexInstallRecordsSync({
        env,
        ...(params.stateDir ? { stateDir: params.stateDir } : {}),
        ...(params.pluginIndexFilePath ? { filePath: params.pluginIndexFilePath } : {}),
      })) as Record<string, never> | undefined,
  );
  const plugins = buildInstalledPluginIndexRecords({
    candidates,
    registry: registry as never,
    config: params.config as OpenClawConfig | undefined,
    diagnostics,
    installRecords,
  });

  return {
    index: {
      version: INSTALLED_PLUGIN_INDEX_VERSION,
      warning: INSTALLED_PLUGIN_INDEX_WARNING,
      hostContractVersion: resolveCompatibilityHostVersion(env),
      compatRegistryVersion: resolveCompatRegistryVersion(),
      migrationVersion: INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
      policyHash: resolveInstalledPluginIndexPolicyHash(params.config as OpenClawConfig | undefined),
      generatedAtMs,
      ...(params.refreshReason ? { refreshReason: params.refreshReason } : {}),
      installRecords,
      plugins,
      diagnostics,
    },
    discovery: discovery as PluginDiscoveryResult | undefined,
  };
}

/** Loads the installed plugin index from candidates and config. */
export function loadInstalledPluginIndex(
  params: LoadInstalledPluginIndexParams = {},
): InstalledPluginIndex {
  return buildInstalledPluginIndex(params).index;
}

/** Loads the installed plugin index together with discovery result. */
export function loadInstalledPluginIndexWithDiscovery(
  params: LoadInstalledPluginIndexParams = {},
): { index: InstalledPluginIndex; discovery: PluginDiscoveryResult | undefined } {
  return buildInstalledPluginIndex(params);
}

/** Refreshes the installed plugin index with a refresh reason. */
export function refreshInstalledPluginIndex(
  params: RefreshInstalledPluginIndexParams,
): InstalledPluginIndex {
  return buildInstalledPluginIndex({ ...params, refreshReason: params.reason }).index;
}

/** Lists all installed plugin records in the index. */
export function listInstalledPluginRecords(
  index: InstalledPluginIndex,
): readonly InstalledPluginIndexRecord[] {
  return index.plugins;
}

/** Lists enabled installed plugin records in the index. */
export function listEnabledInstalledPluginRecords(
  index: InstalledPluginIndex,
  config?: OpenClawConfig,
): readonly InstalledPluginIndexRecord[] {
  if (!config) {
    return index.plugins.filter((plugin) => plugin.enabled);
  }
  return index.plugins.filter((plugin) => isInstalledPluginEnabled(index, plugin.pluginId, config));
}

/** Returns one installed plugin record by plugin id, or undefined. */
export function getInstalledPluginRecord(
  index: InstalledPluginIndex,
  pluginId: string,
): InstalledPluginIndexRecord | undefined {
  return index.plugins.find((plugin) => plugin.pluginId === pluginId);
}

/** True when a plugin is enabled in the index (and optionally via config). */
export function isInstalledPluginEnabled(
  index: InstalledPluginIndex,
  pluginId: string,
  config?: OpenClawConfig,
): boolean {
  const record = getInstalledPluginRecord(index, pluginId);
  if (!record) {
    return false;
  }
  if (!config) {
    return record.enabled;
  }
  const normalizedConfig = normalizePluginsConfig(config?.plugins);
  const state = resolveEffectivePluginActivationState({
    id: record.pluginId,
    origin: record.origin ?? "unknown",
    config: normalizedConfig,
    rootConfig: config,
    enabledByDefault: isPluginEnabledByDefaultForPlatform(record as never),
  });
  return state.enabled && (record.enabled || Boolean(state.explicitlyEnabled));
}

// ============================================================================
// 内联降级类型占位（仅用于本地诊断类型）
// ============================================================================

/** 插件诊断信息的最小结构占位。 */
type PluginDiagnostic = {
  level: "warn" | "error";
  message: string;
  pluginId?: string;
  source?: string;
};
