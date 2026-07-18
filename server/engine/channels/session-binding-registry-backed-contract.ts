// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/session-binding-registry-backed-contract.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function describeSessionBindingRegistryBackedContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: describeSessionBindingRegistryBackedContract");
}
