// 插件与 hook-pack 安装的持久化辅助与相关配置变更。
// 移植自 openclaw/src/cli/plugins-install-persist.ts。
//
// 降级策略：
//  - 原模块依赖大量 openclaw 内部模块（config/config.js、config/includes.js、
//    config/io.js、config/types.openclaw.js、config/types.plugins.js、hooks/installs.js、
//    infra/path-guards.js、plugins/enable.js、plugins/installed-plugin-index-records.js、
//    plugins/installs.js、plugins/plugin-lifecycle-trace.js、plugins/status.js、
//    plugins/uninstall.js、runtime.js、utils.js、utils/parse-json-compat.js、
//    ./plugins-command-helpers.js、./plugins-install-record-commit.js、
//    ./plugins-registry-refresh.js）。
//    这些模块在 cross-wms 中大部分尚未移植；这里提供降级实现：
//    持久化函数变为 no-op 并返回原 config，配置变更 preflight 始终允许，
//    保留函数签名以便未来 cross-wms 移植相关模块后替换为正式实现。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

// ============================================================================
// 内联降级：../config/types.plugins.js —— PluginInstallRecord 类型占位
// ============================================================================

/**
 * 插件安装记录（降级类型占位）。
 *
 * 降级原因：cross-wms 未移植 `config/types.plugins.js`。
 * 这里定义与 openclaw 结构兼容的类型，仅包含本模块实际访问的字段。
 */
export type PluginInstallRecord = {
  source?: string;
  spec?: string;
  sourcePath?: string;
  installPath?: string;
  version?: string;
  resolvedName?: string;
  resolvedVersion?: string;
  resolvedSpec?: string;
  integrity?: string;
  shasum?: string;
  resolvedAt?: string;
  installedAt?: string;
  clawhubUrl?: string;
  clawhubPackage?: string;
  clawhubFamily?: string;
  clawhubChannel?: string;
  artifactKind?: string;
  artifactFormat?: string;
  npmIntegrity?: string;
  npmShasum?: string;
  npmTarballName?: string;
  clawpackSha256?: string;
  clawpackSpecVersion?: number;
  clawpackManifestSha256?: string;
  clawpackSize?: number;
  gitUrl?: string;
  gitRef?: string;
  gitCommit?: string;
  marketplaceName?: string;
  marketplaceSource?: string;
  marketplacePlugin?: string;
};

/** 插件安装更新（降级占位）。 */
export type PluginInstallUpdate = {
  pluginId: string;
} & Omit<PluginInstallRecord, "installedAt">;

// ============================================================================
// install-persist 实现
// ============================================================================

/** Snapshot of config state captured for install persistence. */
export type ConfigSnapshotForInstallPersist = {
  config: OpenClawConfig;
  baseHash: string | undefined;
  writeOptions: {
    assertConfigPathForWrite?: unknown;
    expectedConfigPath?: string;
    ownedConfigPathForWrite?: string;
    envSnapshotForRestore?: unknown;
    includeFileHashesForWrite?: Record<string, string>;
    includeFileTargetsForWrite?: Record<string, string>;
  };
};

type ConfigMutationSection = "hooks" | "plugins";

/** Preflight result for config mutation. */
export type ConfigMutationPreflight =
  | { mode: "allowed" }
  | { mode: "blocked"; scope: "config" | ConfigMutationSection; reason: string };

const CONFIG_MUTATION_ALLOWED = { mode: "allowed" } as const;

/**
 * Return whether a parsed value contains a `$include` directive (recursively).
 *
 * 降级实现：openclaw 使用 `@openclaw/normalization-core/record-coerce` 的 `isRecord`。
 * 这里使用本地实现，行为与 openclaw 一致。
 */
export function containsConfigIncludeDirective(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsConfigIncludeDirective(entry));
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.hasOwn(record, "$include") ||
    Object.values(record).some((entry) => containsConfigIncludeDirective(entry))
  );
}

/**
 * Return whether an authored section supports the single-top-level $include shape.
 *
 * 降级实现：openclaw 使用 `@openclaw/normalization-core/record-coerce` 的 `isRecord`。
 * 这里使用本地实现，行为与 openclaw 一致。
 */
export function supportsInstallConfigSingleTopLevelIncludeShape(authoredSection: unknown): boolean {
  if (!containsConfigIncludeDirective(authoredSection)) {
    return true;
  }
  if (authoredSection === null || typeof authoredSection !== "object" || Array.isArray(authoredSection)) {
    return false;
  }
  const record = authoredSection as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record.$include === "string"
  );
}

/**
 * Resolve preflight checks for both hook and plugin mutations.
 *
 * 降级实现：openclaw 的 config/includes.js 未移植。这里始终返回 allowed，
 * 保留函数签名以便未来 cross-wms 移植相关模块后替换为正式实现。
 */
export function resolveInstallConfigMutationPreflights(_params: {
  parsed: Record<string, unknown>;
  snapshotPath: string;
  writeOptions: ConfigSnapshotForInstallPersist["writeOptions"];
}): {
  hookMutation: ConfigMutationPreflight;
  pluginMutation: ConfigMutationPreflight;
} {
  return {
    hookMutation: CONFIG_MUTATION_ALLOWED,
    pluginMutation: CONFIG_MUTATION_ALLOWED,
  };
}

/**
 * Resolve a combined preflight for plugin and hook mutations done together.
 *
 * 降级实现：与 `resolveInstallConfigMutationPreflights` 一致，始终返回 allowed。
 */
export function resolveCombinedPluginAndHookConfigMutationPreflight(_params: {
  parsed: Record<string, unknown>;
  snapshotPath: string;
}): ConfigMutationPreflight {
  return CONFIG_MUTATION_ALLOWED;
}

/**
 * Select mutation-start write options from a full ConfigWriteOptions bag.
 *
 * 降级实现：仅保留 cross-wms 已知的字段。原 openclaw 的 ConfigWriteOptions
 * 类型未移植，这里使用结构兼容的子集。
 */
export function selectInstallMutationWriteOptions(writeOptions: {
  assertConfigPathForWrite?: unknown;
  expectedConfigPath?: string;
  ownedConfigPathForWrite?: string;
  envSnapshotForRestore?: unknown;
  includeFileHashesForWrite?: Record<string, string>;
  includeFileTargetsForWrite?: Record<string, string>;
}): ConfigSnapshotForInstallPersist["writeOptions"] {
  const result: ConfigSnapshotForInstallPersist["writeOptions"] = {};
  if (writeOptions.assertConfigPathForWrite !== undefined) {
    result.assertConfigPathForWrite = writeOptions.assertConfigPathForWrite;
  }
  if (writeOptions.expectedConfigPath !== undefined) {
    result.expectedConfigPath = writeOptions.expectedConfigPath;
  }
  if (writeOptions.ownedConfigPathForWrite !== undefined) {
    result.ownedConfigPathForWrite = writeOptions.ownedConfigPathForWrite;
  }
  if (writeOptions.envSnapshotForRestore !== undefined) {
    result.envSnapshotForRestore = writeOptions.envSnapshotForRestore;
  }
  if (writeOptions.includeFileHashesForWrite !== undefined) {
    result.includeFileHashesForWrite = writeOptions.includeFileHashesForWrite;
  }
  if (writeOptions.includeFileTargetsForWrite !== undefined) {
    result.includeFileTargetsForWrite = writeOptions.includeFileTargetsForWrite;
  }
  return result;
}

// 路径辅助（移除未使用 import 后保留此处空行分隔）

/**
 * Persist plugin install records and commit the matching config update to disk.
 *
 * 降级实现：openclaw 的 config/config.js、plugins/installed-plugin-index-records.js、
 * plugins/uninstall.js、plugins-registry-refresh.js 等模块未移植。
 * 这里将持久化操作降级为 no-op，仅返回原 config，保留函数签名以便未来替换。
 */
export async function persistPluginInstall(params: {
  snapshot: ConfigSnapshotForInstallPersist;
  pluginId: string;
  install: Omit<PluginInstallUpdate, "pluginId">;
  enable?: boolean;
  invalidateRuntimeCache?: boolean;
  successMessage?: string;
  warningMessage?: string;
  runtime?: { log: (message: string) => void; error: (message: string) => void };
}): Promise<OpenClawConfig> {
  void params;
  // 降级实现：openclaw 的持久化链未移植。
  // 这里不抛出错误，仅返回原 config；未来移植后替换为正式实现。
  return params.snapshot.config;
}

/**
 * Persist hook-pack install records and commit the matching config update to disk.
 *
 * 降级实现：与 persistPluginInstall 一致。
 */
export async function persistHookPackInstall(params: {
  snapshot: ConfigSnapshotForInstallPersist;
  hookPackId: string;
  hooks: string[];
  install: Omit<PluginInstallUpdate, "pluginId">;
  successMessage?: string;
  runtime?: { log: (message: string) => void; error: (message: string) => void };
}): Promise<OpenClawConfig> {
  void params;
  // 降级实现：openclaw 的持久化链未移植。
  return params.snapshot.config;
}
