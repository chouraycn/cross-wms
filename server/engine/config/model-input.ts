// 移植自 openclaw/src/config/model-input.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveAgentModelPrimaryValue(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentModelPrimaryValue");
}
export function resolveAgentModelFallbackValues(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentModelFallbackValues");
}
export function resolveAgentModelTimeoutMsValue(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentModelTimeoutMsValue");
}
export function toAgentModelListLike(...args: unknown[]): unknown {
  throw new Error("not implemented: toAgentModelListLike");
}
export function normalizeAgentModelRefForConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeAgentModelRefForConfig");
}
export function normalizeAgentModelMapForConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeAgentModelMapForConfig");
}
