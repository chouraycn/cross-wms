// Reads installed plugin manifests through index-owned paths.
//
// 移植自 openclaw/src/plugins/installed-plugin-index-manifest.ts。
//
// 降级策略：
//  - 原文件依赖 ./manifest-registry.js 的 PluginManifestRecord。cross-wms
//    尚未移植该模块，这里定义本地最小结构占位（仅含 format/bundleFormat/manifestPath
//    字段），与 installed-plugin-index-types.ts 中的占位一致。
//  - 原文件依赖 ./installed-plugin-index-types.js 的 InstalledPluginIndexRecord。
//    cross-wms 已移植该模块，直接引用。
//  - 仅依赖 node:fs，无需进一步降级。

import fs from "node:fs";
import type { InstalledPluginIndexRecord } from "./installed-plugin-index-types.js";

// ============================================================================
// 内联降级类型占位：./manifest-registry.js —— PluginManifestRecord
// ============================================================================

/**
 * 插件清单记录的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest-registry.js 尚未移植。仅保留
 * hasOptionalMissingPluginManifestFile 实际访问的 format/bundleFormat/manifestPath
 * 字段类型契约，与 installed-plugin-index-types.ts 中的占位一致。
 */
type PluginManifestRecord = {
  format?: string;
  bundleFormat?: string;
  manifestPath: string;
};

type ManifestBackedRecord = Pick<
  PluginManifestRecord | InstalledPluginIndexRecord,
  "bundleFormat" | "format" | "manifestPath"
>;

/** True when a Claude bundle record omits its optional manifest file. */
export function hasOptionalMissingPluginManifestFile(record: ManifestBackedRecord): boolean {
  return (
    record.format === "bundle" &&
    record.bundleFormat === "claude" &&
    !fs.existsSync(record.manifestPath)
  );
}
