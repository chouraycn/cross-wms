/**
 * Ported from openclaw/src/agents/plugin-tool-delivery-defaults.ts
 *
 * Plugin tool delivery defaults.
 * Cross-wms degradation: returns input unchanged without plugin system.
 */

/** Applies plugin tool delivery defaults to tool definitions. */
export function applyPluginToolDeliveryDefaults<T>(tools: T): T {
  // Cross-wms does not have plugin tool delivery defaults.
  return tools;
}
