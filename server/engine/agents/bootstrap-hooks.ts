/**
 * 移植自 openclaw/src/agents/bootstrap-hooks.ts
 *
 * 降级实现：提供 bootstrap hook 覆盖，不再抛出 stub 错误。
 */

export async function applyBootstrapHookOverrides(_params: unknown): Promise<void> {
  // no-op in cross-wms降级实现
}
