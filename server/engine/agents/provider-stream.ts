/**
 * Ported from openclaw/src/agents/provider-stream.ts
 *
 * Provider stream registration for model dispatch.
 * Cross-wms degradation: no-op registration without stream registry.
 */

/** Registers a provider stream handler for a model. */
export function registerProviderStreamForModel(..._args: unknown[]): void {
  // Cross-wms does not have provider stream registry.
}
