/**
 * Ported from openclaw/src/agents/agent-bundle-mcp-test-harness.ts
 *
 * MCP test harness cleanup.
 * Cross-wms degradation: no-op without MCP harness state.
 */

/** Cleans up bundle MCP test harness resources. */
export function cleanupBundleMcpHarness(..._args: unknown[]): void {
  // Cross-wms does not have MCP test harness state.
}
