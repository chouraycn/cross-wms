/**
 * 移植自 openclaw/src/agents/harness/runtime-plugin.ts
 *
 * Agent harness runtime plugin setup.
 * In cross-wms the harness plugin infrastructure is not available,
 * so ensureSelectedAgentHarnessPlugin is a no-op.
 */

/** Ensure the selected agent harness plugin is loaded (no-op in cross-wms). */
export function ensureSelectedAgentHarnessPlugin(..._args: unknown[]): void {
  // No-op: harness plugin setup not available in cross-wms.
}
