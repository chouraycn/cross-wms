// Lazy plugin-registry loader for CLI commands that need plugin command/capability metadata.
// 移植自 openclaw/src/cli/plugin-registry-loader.ts。
//
// 降级策略：
//  - 原模块依赖 `../config/types.openclaw.js` 的 `OpenClawConfig`、
//    `../logging/state.js` 的 `loggingState`、`../shared/lazy-promise.js` 的
//    `createLazyImportLoader`、`./command-catalog.js` 的 `CliPluginRegistryScope`、
//    `./plugin-registry.js` 的 `ensurePluginRegistryLoaded`。
//    其中 `logging/state.js`、`shared/lazy-promise.js`、`command-catalog.js` 未移植。
//  - 这里提供降级实现：直接调用本地 `./plugin-registry.js` 的 stub，
//    跳过 logging state 路由与 lazy loader，保留函数签名以便未来替换为正式实现。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import { ensurePluginRegistryLoaded, type PluginRegistryScope } from "./plugin-registry.js";

// ===== 内联降级：CliPluginRegistryScope 类型别名 =====
/**
 * CLI 插件注册表作用域（降级占位，复用 PluginRegistryScope）。
 *
 * 降级原因：openclaw 的 `command-catalog.js` 中的 `CliPluginRegistryScope` 未移植。
 */
type CliPluginRegistryScope = PluginRegistryScope;
// ===== CliPluginRegistryScope 结束 =====

/**
 * Load the CLI plugin registry and optionally route activation logs to stderr.
 *
 * 降级实现：
 *  - openclaw 的 `logging/state.js`、`shared/lazy-promise.js` 未移植；
 *    这里跳过 logging state 路由（不强制 stderr），直接调用本地
 *    `./plugin-registry.js` 的 `ensurePluginRegistryLoaded` stub。
 *  - 保留函数签名以便未来替换为正式实现。
 */
export async function ensureCliPluginRegistryLoaded(params: {
  scope: CliPluginRegistryScope;
  routeLogsToStderr?: boolean;
  config?: OpenClawConfig;
  activationSourceConfig?: OpenClawConfig;
}): Promise<void> {
  // 降级：忽略 routeLogsToStderr（logging/state 未移植）。
  void params.routeLogsToStderr;
  ensurePluginRegistryLoaded({
    scope: params.scope,
    ...(params.config ? { config: params.config } : {}),
    ...(params.activationSourceConfig
      ? { activationSourceConfig: params.activationSourceConfig }
      : {}),
  });
}
