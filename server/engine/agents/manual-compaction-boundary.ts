/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/manual-compaction-boundary.ts
 *
 * Manual compaction boundary hardening.
 * In cross-wms the compaction boundary infrastructure is not available,
 * so hardenManualCompactionBoundary is a no-op passthrough.
 */

/** Harden manual compaction boundary (passthrough in cross-wms). */
export function hardenManualCompactionBoundary<T>(value: T): T {
  return value;
}
