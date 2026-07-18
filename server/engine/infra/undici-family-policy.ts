// 移植自 openclaw/src/infra/undici-family-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveUndiciAutoSelectFamily(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveUndiciAutoSelectFamily");
}
export function createUndiciAutoSelectFamilyConnectOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: createUndiciAutoSelectFamilyConnectOptions");
}
export function resolveUndiciAutoSelectFamilyConnectOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveUndiciAutoSelectFamilyConnectOptions");
}
export function withTemporaryUndiciAutoSelectFamily(...args: unknown[]): unknown {
  throw new Error("not implemented: withTemporaryUndiciAutoSelectFamily");
}
