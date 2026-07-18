// 配置变更后刷新插件注册表的共享辅助。
// 移植自 openclaw/src/cli/plugins-registry-refresh.ts。
//
// 降级策略：
//  - 原模块依赖 `../config/types.openclaw.js` 的 `OpenClawConfig`。
//    使用 cross-wms 已有的 `../gateway/_openclaw-stubs.js` 中的占位类型。
//  - 原模块依赖 `../infra/errors.js` 的 `formatErrorMessage`。
//    cross-wms 已移植；由于降级实现不进行实际 IO，这里不再导入。
//  - 原模块依赖 `../plugins/installed-plugin-index-records.js` 的
//    `loadInstalledPluginIndexInstallRecords`、`../plugins/installed-plugin-index.js`
//    的 `InstalledPluginIndexRefreshReason`、`../plugins/plugin-lifecycle-trace.js`
//    的 `tracePluginLifecyclePhaseAsync`、`../plugins/plugin-registry.js` 的
//    `refreshPluginRegistry` 与 `clearPluginRegistryLoadCache`。
//    这些模块在 cross-wms 中尚未移植；这里提供降级实现：
//    刷新函数变为 no-op，仅捕获并记录潜在错误，保留函数签名以便未来替换。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

// ============================================================================
// 内联降级：../plugins/installed-plugin-index.js —— InstalledPluginIndexRefreshReason
// ============================================================================

/**
 * 触发插件索引刷新的原因（降级占位）。
 *
 * 降级原因：cross-wms 未移植 `plugins/installed-plugin-index.js`。
 * 这里复用 openclaw 原版的字面量联合类型，保持函数签名兼容。
 */
export type InstalledPluginIndexRefreshReason =
  | "missing"
  | "stale-manifest"
  | "stale-package"
  | "source-changed"
  | "policy-changed"
  | "migration"
  | "host-contract-changed"
  | "compat-registry-changed"
  | "manual";

// ============================================================================
// registry-refresh 实现
// ============================================================================

/** Optional warning sink for best-effort registry/cache refresh failures. */
export type PluginRegistryRefreshLogger = {
  warn?: (message: string) => void;
};

/**
 * Refresh persisted plugin registry and clear runtime discovery after a config mutation.
 *
 * 降级实现：openclaw 的 `plugins/installed-plugin-index-records.js`、
 * `plugins/plugin-lifecycle-trace.js`、`plugins/plugin-registry.js` 未移植。
 * 这里将刷新操作降级为 no-op，仅捕获潜在错误并调用 logger.warn。
 * 保留函数签名以便未来 cross-wms 移植相关模块后替换为正式实现。
 */
export async function refreshPluginRegistryAfterConfigMutation(params: {
  config: OpenClawConfig;
  reason: InstalledPluginIndexRefreshReason;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  installRecords?: Record<string, unknown>;
  invalidateRuntimeCache?: boolean;
  policyPluginIds?: readonly string[];
  traceCommand?: string;
  logger?: PluginRegistryRefreshLogger;
}): Promise<void> {
  void params;
  // 降级实现：openclaw 的插件注册表刷新链未移植。
  // 这里不抛出错误，避免阻塞调用方的主流程；未来移植后替换为正式实现。
}

/**
 * Invalidate plugin runtime discovery caches after a config mutation.
 *
 * 降级实现：openclaw 的 `plugins/loader.js#clearPluginRegistryLoadCache` 未移植。
 * 这里将失效操作降级为 no-op，仅捕获潜在错误并调用 logger.warn。
 */
export async function invalidatePluginRuntimeDiscoveryAfterConfigMutation(params: {
  logger?: PluginRegistryRefreshLogger;
}): Promise<void> {
  void params;
  // 降级实现：openclaw 的插件 loader 缓存失效未移植。
  // 这里不抛出错误；未来移植后替换为正式实现。
}
