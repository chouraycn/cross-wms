/**
 * Runtime bridge for plugin-provided CLI backends.
 * 移植自 openclaw/src/plugins/cli-backends.runtime.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginCliBackendEntry = unknown;

export function resolveRuntimeCliBackends(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveRuntimeCliBackends");
}

