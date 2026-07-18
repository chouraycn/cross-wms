// 移植自 openclaw/src/infra/provider-usage-plugin-runtime.test-mocks.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resetProviderUsageSnapshotWithPluginMock(...args: unknown[]): unknown {
  throw new Error("not implemented: resetProviderUsageSnapshotWithPluginMock");
}
export function getProviderUsageSnapshotWithPluginMock(...args: unknown[]): unknown {
  throw new Error("not implemented: getProviderUsageSnapshotWithPluginMock");
}
