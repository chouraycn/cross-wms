/**
 * Loads runtime sidecar path baselines for bundled plugin checks.
 * 移植自 openclaw/src/plugins/runtime-sidecar-paths-baseline.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function collectBundledRuntimeSidecarPaths(...args: unknown[]): unknown {
  throw new Error("not implemented: collectBundledRuntimeSidecarPaths");
}


