// Checks package compatibility metadata for plugin manifests.
//
// 移植自 openclaw/src/plugins/package-compat.ts。
//
// 降级策略：
//  - 原文件依赖 `@openclaw/normalization-core/record-coerce` 的 `isRecord`。
//    cross-wms 的 `../infra/record-coerce.js` 已提供同名导出，行为一致，
//    直接替换 import 路径即可，无需进一步降级。

import { isRecord } from "../infra/record-coerce.js";

/** Result of reading package.json openclaw.compat.pluginApi metadata. */
export type PackagePluginApiRangeResult =
  | { ok: true; range?: string }
  | { ok: false; error: string };

/** Resolves the plugin API compatibility range declared by package metadata. */
export function resolvePackagePluginApiRange(
  packageMetadata: unknown,
): PackagePluginApiRangeResult {
  if (packageMetadata === undefined || packageMetadata === null) {
    return { ok: true };
  }
  if (!isRecord(packageMetadata)) {
    return { ok: true };
  }
  if (!("compat" in packageMetadata)) {
    return { ok: true };
  }
  const compat = packageMetadata.compat;
  if (compat === undefined || compat === null) {
    return { ok: true };
  }
  if (!isRecord(compat)) {
    return { ok: false, error: "package.json openclaw.compat must be an object" };
  }
  if (!("pluginApi" in compat)) {
    return { ok: true };
  }
  const pluginApi = compat.pluginApi;
  if (typeof pluginApi !== "string") {
    return { ok: false, error: "package.json openclaw.compat.pluginApi must be a string" };
  }
  const range = pluginApi.trim();
  if (!range) {
    return { ok: false, error: "package.json openclaw.compat.pluginApi must not be empty" };
  }
  return { ok: true, range };
}
