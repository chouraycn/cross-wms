/**
 * Ported from openclaw/src/agents/embedded-agent-runner/run/attempt-bootstrap-routing.ts
 *
 * Attempt workspace bootstrap routing resolution.
 * Cross-wms degradation: returns default routing without agent config.
 */

/** Resolves attempt workspace bootstrap routing. */
export function resolveAttemptWorkspaceBootstrapRouting(params: {
  cfg?: Record<string, unknown>;
  agentId?: string;
}): Record<string, unknown> {
  // Cross-wms does not have agent-specific bootstrap routing.
  return {};
}
