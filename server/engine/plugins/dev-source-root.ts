/**
 * Resolves development source roots for local plugin installs.
 * 移植自 openclaw/src/plugins/dev-source-root.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const OPENCLAW_DEV_SOURCE_ROOT_ENV: unknown = undefined;

export function resolveOpenClawDevSourceRoot(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOpenClawDevSourceRoot");
}

export function isBundledPluginInsideDevSourceRoot(...args: unknown[]): unknown {
  throw new Error("not implemented: isBundledPluginInsideDevSourceRoot");
}

