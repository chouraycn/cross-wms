/**
 * * Loads capability providers from bundled plugin public runtime artifacts.
 * 移植自 openclaw/src/plugins/bundled-capability-runtime.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function buildVitestCapabilityShimAliasMap(...args: unknown[]): unknown {
  throw new Error("not implemented: buildVitestCapabilityShimAliasMap");
}

export function buildBundledCapabilityRuntimeConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: buildBundledCapabilityRuntimeConfig");
}

export function loadBundledCapabilityRuntimeRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: loadBundledCapabilityRuntimeRegistry");
}

