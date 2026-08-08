/**
 * Ported from openclaw/src/agents/embedded-agent-runner/message-action-discovery-input.ts
 *
 * Embedded message action discovery input builder.
 * Cross-wms degradation: returns empty object without action discovery.
 */

/** Builds embedded message action discovery input. */
export function buildEmbeddedMessageActionDiscoveryInput(..._args: any[]): Record<string, any> {
  // Cross-wms does not have message action discovery.
  return {};
}
