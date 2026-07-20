/**
 * Ported from openclaw/src/agents/runtime-plugins.ts
 *
 * Runtime plugin loading.
 * Cross-wms degradation: no-op without plugin system.
 */

/** Ensures runtime plugins are loaded. */
export function ensureRuntimePluginsLoaded(..._args: unknown[]): void {
  // Cross-wms does not have the runtime plugin system.
}
