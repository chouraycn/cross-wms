// 从持久化的插件与 hook-pack 安装记录中提取 npm 包名的辅助函数。
// 移植自 openclaw/src/cli/plugins-install-records.ts。
//
// 降级策略：
//  - 原模块依赖 `../config/types.hooks.js` 的 `HookInstallRecord`。
//    cross-wms 未移植该类型；这里内联一个结构兼容的类型占位，
//    仅包含本模块实际访问的字段（spec/resolvedSpec/resolvedName）。
//  - 原模块依赖 `../config/types.plugins.js` 的 `PluginInstallRecord`。
//    cross-wms 未移植该类型；这里内联一个结构兼容的类型占位。
//  - 原模块依赖 `../infra/npm-registry-spec.js` 的 `parseRegistryNpmSpec`。
//    cross-wms 已移植同名导出，直接使用。

import { parseRegistryNpmSpec } from "../infra/npm-registry-spec.js";

// ============================================================================
// 内联降级：../config/types.plugins.js —— PluginInstallRecord 类型占位
// ============================================================================

/**
 * 插件安装记录（降级类型占位）。
 *
 * 降级原因：cross-wms 未移植 `config/types.plugins.js`。
 * 这里定义与 openclaw 结构兼容的类型，仅包含本模块实际访问的字段。
 */
type PluginInstallRecord = {
  source?: string;
  spec?: string;
  resolvedSpec?: string;
  resolvedName?: string;
  marketplacePlugin?: string;
};

// ============================================================================
// 内联降级：../config/types.hooks.js —— HookInstallRecord 类型占位
// ============================================================================

/**
 * Hook-pack 安装记录（降级类型占位）。
 *
 * 降级原因：cross-wms 未移植 `config/types.hooks.js`。
 * 这里定义与 openclaw 结构兼容的类型，仅包含本模块实际访问的字段。
 */
type HookInstallRecord = {
  spec?: string;
  resolvedSpec?: string;
  resolvedName?: string;
};

// ============================================================================
// install-records 实现
// ============================================================================

/** Return the installed npm package name for a plugin install record when available. */
export function extractInstalledNpmPackageName(install: PluginInstallRecord): string | undefined {
  if (install.source !== "npm") {
    return undefined;
  }
  const resolvedName = install.resolvedName?.trim();
  if (resolvedName) {
    return resolvedName;
  }
  return (
    (install.spec ? parseRegistryNpmSpec(install.spec)?.name : undefined) ??
    (install.resolvedSpec ? parseRegistryNpmSpec(install.resolvedSpec)?.name : undefined)
  );
}

/** Return the installed npm package name for a hook-pack install record when available. */
export function extractInstalledNpmHookPackageName(install: HookInstallRecord): string | undefined {
  const resolvedName = install.resolvedName?.trim();
  if (resolvedName) {
    return resolvedName;
  }
  return (
    (install.spec ? parseRegistryNpmSpec(install.spec)?.name : undefined) ??
    (install.resolvedSpec ? parseRegistryNpmSpec(install.resolvedSpec)?.name : undefined)
  );
}
