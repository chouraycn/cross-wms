// 移植自 openclaw/src/config/combined-store-gateway.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function loadCombinedSessionStoreForGateway(...args: unknown[]): unknown {
  throw new Error("not implemented: loadCombinedSessionStoreForGateway");
}
