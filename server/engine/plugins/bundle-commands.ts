/**
 * Bundles plugin command metadata for package output.
 * 移植自 openclaw/src/plugins/bundle-commands.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type ClaudeBundleCommandSpec = unknown;

export function loadEnabledClaudeBundleCommands(...args: unknown[]): unknown {
  throw new Error("not implemented: loadEnabledClaudeBundleCommands");
}

