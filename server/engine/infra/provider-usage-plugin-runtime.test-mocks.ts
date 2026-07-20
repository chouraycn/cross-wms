// 移植自 openclaw/src/infra/provider-usage-plugin-runtime.test-mocks.ts
// 降级：测试 mock 模块

export type ProviderUsageSnapshotMock = {
  provider: string;
  windows: unknown[];
  error?: string;
};

const mockSnapshots = new Map<string, ProviderUsageSnapshotMock>();

/** Resets the provider usage snapshot with plugin mock. */
export function resetProviderUsageSnapshotWithPluginMock(provider: string): void {
  mockSnapshots.delete(provider);
}

/** Gets a provider usage snapshot with plugin mock. */
export function getProviderUsageSnapshotWithPluginMock(provider: string, _params?: unknown): ProviderUsageSnapshotMock | undefined {
  return mockSnapshots.get(provider);
}
