/**
 * Ported from openclaw/src/agents/embedded-agent-runner/run/attempt.subscription-cleanup.ts
 *
 * Embedded attempt subscription cleanup.
 * Cross-wms degradation: no-op without subscription management.
 */

export const EMBEDDED_ABORT_SETTLE_TIMEOUT_MS = 5_000;

/** Builds embedded subscription parameters. */
export function buildEmbeddedSubscriptionParams(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have embedded subscription parameters.
  return {};
}

/** Cleans up embedded attempt resources. */
export function cleanupEmbeddedAttemptResources(..._args: unknown[]): void {
  // Cross-wms does not have embedded attempt resource cleanup.
}
