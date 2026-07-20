/**
 * Ported from openclaw/src/agents/test-helpers/host-sandbox-fs-bridge.ts
 *
 * Host/sandbox filesystem bridge for test environments.
 * Cross-wms degradation: returns no-op bridges without filesystem access.
 */

/** Creates a sandbox filesystem bridge from a resolver. */
export function createSandboxFsBridgeFromResolver(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have sandbox FS bridge resolution.
  return {};
}

/** Creates a host sandbox filesystem bridge. */
export function createHostSandboxFsBridge(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have host sandbox FS bridge creation.
  return {};
}
