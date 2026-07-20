/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt-http-runtime.ts
 *
 * Embedded attempt HTTP runtime configuration.
 * In cross-wms the HTTP runtime is not available,
 * so configureEmbeddedAttemptHttpRuntime is a no-op.
 */

/** Configure the embedded attempt HTTP runtime (no-op in cross-wms). */
export function configureEmbeddedAttemptHttpRuntime(..._args: unknown[]): void {
  // No-op: HTTP runtime configuration not available in cross-wms.
}
