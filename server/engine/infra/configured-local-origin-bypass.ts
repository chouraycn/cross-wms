// 移植自 openclaw/src/infra/configured-local-origin-bypass.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfiguredLocalOriginManagedProxyBypass = unknown;
export function shouldUseConfiguredLocalOriginManagedProxyBypass(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldUseConfiguredLocalOriginManagedProxyBypass");
}
