/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/fallbacks.ts
 *
 * Embedded run model fallback helpers.
 * In cross-wms the full model fallback resolution is not available,
 * so hasEmbeddedRunConfiguredModelFallbacks returns false.
 */

/** Check if embedded run has configured model fallbacks (always false in cross-wms). */
export function hasEmbeddedRunConfiguredModelFallbacks(..._args: unknown[]): false {
  return false;
}
