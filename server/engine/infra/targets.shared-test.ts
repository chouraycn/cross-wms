// 移植自 openclaw/src/infra/targets.shared-test.ts
// 降级：测试辅助模块

/** Installs resolve-outbound-target plugin registry hooks for testing. No-op in cross-wms. */
export function installResolveOutboundTargetPluginRegistryHooks(_params?: unknown): void {
  // Test helper: no-op in cross-wms
}

/** Runs core resolve-outbound-target tests. No-op in cross-wms. */
export function runResolveOutboundTargetCoreTests(_params?: unknown): void {
  // Test helper: no-op in cross-wms
}
