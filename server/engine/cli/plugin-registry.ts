// CLI-facing plugin registry loader re-export.
// 移植自 openclaw/src/cli/plugin-registry.ts。
//
// 降级策略：
//  - 原模块从 `../plugins/runtime/runtime-registry-loader.js` re-export
//    `testing`、`ensurePluginRegistryLoaded`、`PluginRegistryScope`。
//    该模块在 cross-wms 中尚未移植；这里提供降级 stub。
//  - `ensurePluginRegistryLoaded` 为 no-op，`testing` 为空对象占位，
//    `PluginRegistryScope` 类型降级为字符串字面量联合。
//    保留函数签名与导出名称以便未来替换为正式实现。

// ===== 内联降级：PluginRegistryScope 类型 =====
/**
 * 插件注册表作用域（降级占位）。
 *
 * 降级原因：openclaw 的 `plugins/runtime/runtime-registry-loader.js` 未移植。
 */
export type PluginRegistryScope = "cli" | "global" | "test";
// ===== PluginRegistryScope 结束 =====

// ===== 内联降级：testing 占位对象 =====
/**
 * 测试辅助占位对象（降级 stub）。
 *
 * 降级原因：openclaw 的 `plugins/runtime/runtime-registry-loader.js` 未移植；
 * 原模块通过 `testing` 暴露测试用的内部状态重置函数，这里提供空对象占位。
 */
export const testing: Record<string, never> = {};
// ===== testing 结束 =====

// ===== 内联降级：ensurePluginRegistryLoaded stub =====
/**
 * Load the CLI plugin registry.
 *
 * 降级实现：openclaw 的 `plugins/runtime/runtime-registry-loader.js` 未移植；
 * 这里为 no-op，保留函数签名以便未来替换为正式实现。
 */
export function ensurePluginRegistryLoaded(_params: {
  scope: PluginRegistryScope;
  config?: unknown;
  activationSourceConfig?: unknown;
}): void {
  // no-op
}
// ===== ensurePluginRegistryLoaded stub 结束 =====
