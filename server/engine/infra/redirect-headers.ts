// 移植自 openclaw/src/infra/redirect-headers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function retainSafeHeadersForCrossOriginRedirect(...args: unknown[]): unknown {
  throw new Error("not implemented: retainSafeHeadersForCrossOriginRedirect");
}
