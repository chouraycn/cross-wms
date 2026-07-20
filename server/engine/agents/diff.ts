/**
 * 移植自 openclaw/src/agents/modes/interactive/components/diff.ts
 *
 * Interactive terminal diff renderer.
 * In cross-wms the theme infrastructure is not available,
 * so renderDiff returns the raw diff text unchanged.
 */

/** Render a diff string with colored output (returns raw text in cross-wms). */
export function renderDiff(diffText: string): string {
  return diffText;
}
