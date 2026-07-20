/**
 * Ported from openclaw/src/agents/embedded-agent-runner/run/attempt-session.ts
 *
 * Embedded agent session creation with resource loader.
 * Cross-wms degradation: returns empty session object.
 */

/** Creates an embedded agent session with resource loader. */
export function createEmbeddedAgentSessionWithResourceLoader(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have the embedded agent session factory.
  return {};
}
