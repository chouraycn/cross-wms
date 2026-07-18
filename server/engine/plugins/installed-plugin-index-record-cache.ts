// Caches installed plugin index records for current process lookups.
//
// 移植自 openclaw/src/plugins/installed-plugin-index-record-cache.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/types.plugins.js 的 PluginInstallRecord。
//    cross-wms 的 installs.ts 已定义同名 PluginInstallRecord，但字段集与 openclaw
//    不同。这里内联 openclaw 原版的最小结构占位（仅含 InstallRecordsCacheEntry 中
//    records 的 Record<string, PluginInstallRecord> 类型契约所需字段）。
//  - 行为与 openclaw 原版一致：进程内 Map 缓存安装记录与 generation 计数。

// ============================================================================
// 内联降级类型占位：../config/types.plugins.js —— PluginInstallRecord
// ============================================================================

/**
 * 插件安装记录的最小结构占位。
 *
 * 降级原因：cross-wms 的 installs.ts 已定义 PluginInstallRecord，但字段集与
 * openclaw 不同。这里保留 openclaw 原版字段集以维持 InstallRecordsCacheEntry
 * 中 records 的 Record<string, PluginInstallRecord> 类型契约。
 */
type PluginInstallRecord = Record<string, unknown>;

/** Cached installed plugin records for one store/recovery key. */
export type InstallRecordsCacheEntry = {
  records: Record<string, PluginInstallRecord>;
};

const installRecordsCache = new Map<string, InstallRecordsCacheEntry>();
let installRecordsCacheGeneration = 0;

/** Returns cached installed plugin records for a store/recovery key. */
export function getInstalledPluginIndexInstallRecordsCache(
  key: string,
): InstallRecordsCacheEntry | undefined {
  return installRecordsCache.get(key);
}

/** Stores cached installed plugin records for a store/recovery key. */
export function setInstalledPluginIndexInstallRecordsCache(
  key: string,
  entry: InstallRecordsCacheEntry,
): void {
  installRecordsCache.set(key, entry);
}

/** Current cache generation used to detect concurrent clears during async loads. */
export function getInstalledPluginIndexInstallRecordsCacheGeneration(): number {
  return installRecordsCacheGeneration;
}

/** Clears cached installed plugin records and advances the cache generation. */
export function clearLoadInstalledPluginIndexInstallRecordsCache(): void {
  installRecordsCacheGeneration += 1;
  installRecordsCache.clear();
}
