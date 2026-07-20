/**
 * 移植自 openclaw/src/agents/sandbox/prune.ts
 *
 * Sandbox pruning.
 * In cross-wms the sandbox infrastructure is not available,
 * so maybePruneSandboxes is a no-op.
 */

/** Prune expired sandboxes (no-op in cross-wms). */
export function maybePruneSandboxes(..._args: unknown[]): void {
  // No-op: sandbox pruning not available in cross-wms.
}
