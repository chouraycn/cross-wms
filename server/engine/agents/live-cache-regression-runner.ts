/**
 * 移植自 openclaw/src/agents/live-cache-regression-runner.ts
 *
 * Live cache regression test runner.
 * In cross-wms the live test infrastructure is not available,
 * so runLiveCacheRegression returns a no-op result.
 */

/** Testing flag for live cache regression (disabled in cross-wms). */
export const testing = false;

/** Run live cache regression tests (no-op in cross-wms). */
export async function runLiveCacheRegression(..._args: unknown[]): Promise<void> {
  // No-op: live cache regression testing not available in cross-wms.
}
