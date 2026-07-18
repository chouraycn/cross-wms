/**
 * * Formats plugin source paths for user-facing status output.
 * 移植自 openclaw/src/plugins/source-display.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export { resolvePluginRoots as resolvePluginSourceRoots } from "./roots.js";

// Re-export: export type { PluginSourceRoots } from "./roots.js";

export function formatPluginSourceForTable(...args: unknown[]): unknown {
  throw new Error("not implemented: formatPluginSourceForTable");
}

