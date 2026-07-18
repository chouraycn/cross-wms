/** Builds and compares installed plugin index records for refresh decisions. */
//
// 移植自 openclaw/src/plugins/installed-plugin-index-records.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/types.openclaw.js 的 OpenClawConfig。cross-wms 尚未移植
//    完整配置类型层级。这里定义本地宽松结构占位，与 installed-plugin-index-policy.ts
//    中占位一致。
//  - 原文件依赖 ../config/types.plugins.js 的 PluginInstallRecord。cross-wms 尚未
//    移植该模块。这里降级为 Record<string, unknown> 占位（与
//    installed-plugin-index-record-cache.ts 一致）。
//  - 原文件依赖 ./installed-plugin-index-record-reader.js 的多个函数。cross-wms 已在
//    本批移植中创建降级版，直接引用。
//  - 原文件依赖 ./installed-plugin-index-store-path.js 的
//    resolveInstalledPluginIndexStorePath。cross-wms 已移植该模块，直接引用。
//  - 原文件依赖 ./installed-plugin-index-store.js 的 refreshPersistedInstalledPluginIndex
//    与 refreshPersistedInstalledPluginIndexSync。cross-wms 已在本批移植中创建降级版，
//    直接引用。
//  - 原文件依赖 ./installed-plugin-index.js 的 RefreshInstalledPluginIndexParams 类型。
//    cross-wms 已在本批移植中创建降级版，直接引用。
//  - 原文件依赖 ./installs.js 的 recordPluginInstall 与 PluginInstallUpdate。cross-wms
//    的 installs.ts 中 recordPluginInstall 签名不同（接受单个 record 参数）。这里内联
//    降级实现：仅用 update 更新 records map 中的对应 pluginId 条目。
//  - 行为契约保持一致：当 cross-wms 未来移植 config-state.js 与 installs.ts 真实实现时，
//    可直接替换本地降级实现。

import {
  clearLoadInstalledPluginIndexInstallRecordsCache,
  loadInstalledPluginIndexInstallRecords,
  loadInstalledPluginIndexInstallRecordsSync,
  readPersistedInstalledPluginIndexInstallRecords,
  readPersistedInstalledPluginIndexInstallRecordsSync,
} from "./installed-plugin-index-record-reader.js";
import { resolveInstalledPluginIndexStorePath } from "./installed-plugin-index-store-path.js";
import {
  refreshPersistedInstalledPluginIndex,
  refreshPersistedInstalledPluginIndexSync,
} from "./installed-plugin-index-store.js";
import type { RefreshInstalledPluginIndexParams } from "./installed-plugin-index.js";

export {
  clearLoadInstalledPluginIndexInstallRecordsCache,
  loadInstalledPluginIndexInstallRecords,
  loadInstalledPluginIndexInstallRecordsSync,
  readPersistedInstalledPluginIndexInstallRecords,
  readPersistedInstalledPluginIndexInstallRecordsSync,
};

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足 installed-plugin-index-records 对 config 字段的访问。
 */
type OpenClawConfig = {
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>;
    installs?: Record<string, unknown>;
    [key: string]: unknown;
  };
  channels?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * 插件安装记录（降级占位）。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的 ../config/types.plugins.js。
 * 这里使用 Record<string, unknown> 占位（与 installed-plugin-index-record-cache.ts 一致）。
 */
type PluginInstallRecord = Record<string, unknown>;

/**
 * 插件安装更新（降级占位）。
 *
 * 降级原因：cross-wms 的 installs.ts 中 PluginInstallUpdate 类型签名不同
 * （仅含 pluginId/version/installTime/source/sourceType/installPath）。
 * openclaw 原版 PluginInstallUpdate 还包含 spec/resolvedName/resolvedVersion 等
 * 字段。这里定义本地最小结构占位，仅含 recordPluginInstallInRecords 实际访问的字段。
 */
type PluginInstallUpdate = {
  pluginId: string;
  source?: string;
  spec?: string;
  version?: string;
  resolvedName?: string;
  resolvedVersion?: string;
  installPath?: string;
  [key: string]: unknown;
};

// ============================================================================
// 内联降级：./installs.js —— recordPluginInstall
// ============================================================================

/**
 * 应用一个安装更新到 in-memory 安装记录 map（降级占位）。
 *
 * 降级说明：cross-wms 的 installs.ts 中 recordPluginInstall 签名不同（接受单个
 * PluginInstallRecord 参数，无 config 上下文）。openclaw 原版接受
 * (config, update) 两个参数，返回更新后的 config。这里降级为：直接在 records map
 * 中用 update 字段构造一个 PluginInstallRecord 并写入对应 pluginId。
 */
function applyPluginInstallUpdateToRecords(
  records: Record<string, PluginInstallRecord>,
  update: PluginInstallUpdate,
): Record<string, PluginInstallRecord> {
  records[update.pluginId] = { ...update } as PluginInstallRecord;
  return records;
}

// ============================================================================
// installed-plugin-index-records 实现
// ============================================================================

/** Config path for legacy plugin install records kept for migration/doctor flows. */
export const PLUGIN_INSTALLS_CONFIG_PATH = ["plugins", "installs"] as const;

/** Options shared by installed plugin index record storage helpers. */
export type InstalledPluginIndexRecordStoreOptions = {
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  filePath?: string;
};

type InstalledPluginIndexRecordRefreshOptions = InstalledPluginIndexRecordStoreOptions &
  Partial<Omit<RefreshInstalledPluginIndexParams, "reason" | "installRecords">> & {
    now?: () => Date;
  };

/** Resolves the installed plugin index record store path. */
export function resolveInstalledPluginIndexRecordsStorePath(
  options: InstalledPluginIndexRecordStoreOptions = {},
): string {
  return resolveInstalledPluginIndexStorePath(options);
}

/** Refreshes persisted installed plugin index records asynchronously. */
export async function writePersistedInstalledPluginIndexInstallRecords(
  records: Record<string, PluginInstallRecord>,
  options: InstalledPluginIndexRecordRefreshOptions = {},
): Promise<string> {
  await refreshPersistedInstalledPluginIndex({
    ...options,
    reason: "source-changed",
    installRecords: records as never,
  } as never);
  return resolveInstalledPluginIndexRecordsStorePath(options);
}

/** Refreshes persisted installed plugin index records synchronously. */
export function writePersistedInstalledPluginIndexInstallRecordsSync(
  records: Record<string, PluginInstallRecord>,
  options: InstalledPluginIndexRecordRefreshOptions = {},
): string {
  refreshPersistedInstalledPluginIndexSync({
    ...options,
    reason: "source-changed",
    installRecords: records as never,
  } as never);
  return resolveInstalledPluginIndexRecordsStorePath(options);
}

/** Returns config with plugin install records attached at the canonical config path. */
export function withPluginInstallRecords(
  config: OpenClawConfig,
  records: Record<string, PluginInstallRecord>,
): OpenClawConfig {
  return {
    ...config,
    plugins: {
      ...config.plugins,
      installs: records,
    },
  };
}

/** Returns config with legacy plugin install records removed. */
export function withoutPluginInstallRecords(
  config: OpenClawConfig,
  options: { preserveEmptyPlugins?: boolean } = {},
): OpenClawConfig {
  if (!config.plugins?.installs) {
    return config;
  }
  const { installs: _installs, ...plugins } = config.plugins;
  if (Object.keys(plugins).length === 0) {
    if (options.preserveEmptyPlugins) {
      return { ...config, plugins: {} };
    }
    const { plugins: _plugins, ...rest } = config;
    return rest;
  }
  return {
    ...config,
    plugins,
  };
}

/** Applies one install update to an in-memory install record map. */
export function recordPluginInstallInRecords(
  records: Record<string, PluginInstallRecord>,
  update: PluginInstallUpdate,
): Record<string, PluginInstallRecord> {
  return applyPluginInstallUpdateToRecords(records, update);
}

/** Removes one plugin install record from an in-memory record map. */
export function removePluginInstallRecordFromRecords(
  records: Record<string, PluginInstallRecord>,
  pluginId: string,
): Record<string, PluginInstallRecord> {
  const { [pluginId]: _removed, ...rest } = records;
  return rest;
}
