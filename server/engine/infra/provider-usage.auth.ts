// 移植自 openclaw/src/infra/provider-usage.auth.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ProviderAuth = unknown;
export function resolveProviderAuths(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveProviderAuths");
}
