// 移植自 openclaw/src/infra/targets.shared-test.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function installResolveOutboundTargetPluginRegistryHooks(...args: unknown[]): unknown {
  throw new Error("not implemented: installResolveOutboundTargetPluginRegistryHooks");
}
export function runResolveOutboundTargetCoreTests(...args: unknown[]): unknown {
  throw new Error("not implemented: runResolveOutboundTargetCoreTests");
}
