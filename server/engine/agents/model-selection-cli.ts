/**
 * 移植自 openclaw/src/agents/model-selection-cli.ts
 *
 * Detects providers whose model selections are backed by CLI runtimes.
 * In cross-wms the CLI backend resolution infrastructure is not available,
 * so isCliProvider returns false.
 */

/** Return true when a provider id resolves to a configured CLI backend (always false in cross-wms). */
export function isCliProvider(..._args: unknown[]): false {
  return false;
}
