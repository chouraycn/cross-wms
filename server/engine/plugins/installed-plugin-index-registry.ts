// Builds plugin registry inputs from installed plugin index records.
//
// 移植自 openclaw/src/plugins/installed-plugin-index-registry.ts。
//
// 降级策略：
//  - 原文件依赖 ./config-state.js 的 normalizePluginsConfig。cross-wms 尚未移植
//    该模块。这里内联降级实现：返回空规范化结构（与
//    installed-plugin-index-record-builder.ts 中占位一致）。
//  - 原文件依赖 ./discovery.js 的 discoverOpenClawPlugins、PluginCandidate 与
//    PluginDiscoveryResult。cross-wms 尚未移植该模块。这里降级为返回
//    { candidates: [], discovery: { candidates: [], diagnostics: [] } }。
//  - 原文件依赖 ./installed-plugin-index-record-reader.js 的
//    loadInstalledPluginIndexInstallRecordsSync。cross-wms 已在本批移植中创建降级版，
//    直接引用。
//  - 原文件依赖 ./manifest-registry.js 的 loadPluginManifestRegistry 与
//    PluginManifestRegistry。cross-wms 尚未移植该模块。这里降级为返回
//    { plugins: [], diagnostics: [] }（空清单注册表）。
//  - ./installed-plugin-index-types.js 在 cross-wms 中已存在，直接引用。
//  - 行为契约保持一致：当 cross-wms 未来移植 config-state.js、discovery.js、
//    manifest-registry.js 时，可直接替换本地降级实现。

import { loadInstalledPluginIndexInstallRecordsSync } from "./installed-plugin-index-record-reader.js";
import type { LoadInstalledPluginIndexParams } from "./installed-plugin-index-types.js";

// ============================================================================
// 内联降级类型占位
// ============================================================================

/** 插件候选项（降级 unknown 占位）。 */
type PluginCandidate = unknown;

/** 插件发现结果（降级占位）。 */
type PluginDiscoveryResult = {
  candidates: readonly PluginCandidate[];
  diagnostics: readonly PluginDiagnostic[];
};

/** 插件清单注册表（降级占位）。 */
type PluginManifestRegistry = {
  plugins: readonly PluginManifestRecord[];
  diagnostics?: readonly PluginDiagnostic[];
};

/** 插件清单记录的最小结构占位（与 installed-plugin-index-record-builder.ts 一致）。 */
type PluginManifestRecord = {
  id: string;
  rootDir: string;
  manifestPath: string;
  origin: string;
  [key: string]: unknown;
};

/** 插件诊断信息的最小结构占位。 */
type PluginDiagnostic = {
  level: "warn" | "error";
  message: string;
  pluginId?: string;
  source?: string;
};

// ============================================================================
// 内联降级：./config-state.js —— normalizePluginsConfig
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
 * 结构，使 resolveInstalledPluginIndexRegistry 不传递任何 extraPaths 给 discovery。
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

// ============================================================================
// 内联降级：./discovery.js —— discoverOpenClawPlugins
// ============================================================================

/**
 * 发现 OpenClaw 插件（降级占位）。
 *
 * 降级说明：cross-wms 的 discovery.js 尚未移植。openclaw 原版扫描 workspace 与
 * extraPaths 下的插件候选。这里降级为始终返回空候选列表。
 */
function discoverOpenClawPlugins(_params: {
  workspaceDir?: string;
  extraPaths?: readonly string[];
  env?: NodeJS.ProcessEnv;
  installRecords?: Record<string, unknown>;
}): PluginDiscoveryResult {
  return {
    candidates: [],
    diagnostics: [],
  };
}

// ============================================================================
// 内联降级：./manifest-registry.js —— loadPluginManifestRegistry
// ============================================================================

/**
 * 加载插件清单注册表（降级占位）。
 *
 * 降级说明：cross-wms 的 manifest-registry.js 尚未移植。openclaw 原版从候选列表
 * 构建清单注册表。这里降级为始终返回空注册表（plugins 与 diagnostics 均为空）。
 */
function loadPluginManifestRegistry(_params: {
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  candidates?: readonly PluginCandidate[];
  diagnostics?: readonly PluginDiagnostic[];
  installRecords?: Record<string, unknown>;
}): PluginManifestRegistry {
  return {
    plugins: [],
    diagnostics: [],
  };
}

// ============================================================================
// installed-plugin-index-registry 实现
// ============================================================================

/**
 * 解析 installed plugin index 加载所需的发现候选项与清单注册表。
 *
 * 降级说明：当 params.candidates 已提供时，直接传入 manifest registry；
 * 否则使用降级的 discoverOpenClawPlugins 与 loadPluginManifestRegistry。
 */
export function resolveInstalledPluginIndexRegistry(params: LoadInstalledPluginIndexParams): {
  registry: PluginManifestRegistry;
  candidates: readonly PluginCandidate[];
  discovery?: PluginDiscoveryResult;
} {
  if (params.candidates) {
    return {
      candidates: params.candidates,
      registry: loadPluginManifestRegistry({
        config: params.config,
        workspaceDir: params.workspaceDir,
        env: params.env,
        candidates: params.candidates,
        diagnostics: params.diagnostics,
        installRecords: params.installRecords,
      }),
    };
  }

  const normalized = normalizePluginsConfig(
    (params.config as { plugins?: unknown } | undefined)?.plugins,
  );
  const installRecords =
    params.installRecords ?? loadInstalledPluginIndexInstallRecordsSync({ env: params.env });
  const discovery =
    (params.discovery as PluginDiscoveryResult | undefined) ??
    discoverOpenClawPlugins({
      workspaceDir: params.workspaceDir,
      extraPaths: normalized.loadPaths,
      env: params.env,
      installRecords,
    });
  return {
    candidates: discovery.candidates,
    discovery,
    registry: loadPluginManifestRegistry({
      config: params.config,
      workspaceDir: params.workspaceDir,
      env: params.env,
      candidates: discovery.candidates,
      diagnostics: discovery.diagnostics,
      installRecords,
    }),
  };
}
