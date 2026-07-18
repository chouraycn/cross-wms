// 移植自 openclaw/src/config/model-override-provenance.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function hasSessionAutoModelFallbackProvenance(...args: unknown[]): unknown {
  throw new Error("not implemented: hasSessionAutoModelFallbackProvenance");
}
