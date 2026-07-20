// 移植自 openclaw/src/channels/plugins/configured-binding-builtins.ts
// 降级：channel plugin 依赖简化

/** Ensures configured binding builtins are registered. No-op in cross-wms. */
export function ensureConfiguredBindingBuiltinsRegistered(_params?: unknown): void {
  // No builtins to register without real channel plugins
}
