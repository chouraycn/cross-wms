/**
 * 移植自 openclaw/src/agents/subagent-registry-cleanup.ts
 *
 * Subagent registry cleanup helpers.
 * In cross-wms the full registry cleanup infrastructure is not available,
 * so resolveCleanupCompletionReason returns "keep" and
 * resolveDeferredCleanupDecision returns a no-cleanup decision.
 */

/** Resolve the cleanup completion reason (returns "keep" in cross-wms). */
export function resolveCleanupCompletionReason(..._args: unknown[]): "keep" {
  return "keep";
}

/** Resolve deferred cleanup decision (returns no-cleanup in cross-wms). */
export function resolveDeferredCleanupDecision(..._args: unknown[]): {
  shouldCleanup: false;
} {
  return { shouldCleanup: false };
}
