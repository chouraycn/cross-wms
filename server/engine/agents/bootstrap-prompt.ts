/**
 * Ported from openclaw/src/agents/bootstrap-prompt.ts
 *
 * Bootstrap prompt construction for agent sessions.
 * Cross-wms degradation: returns empty lines without prompt assembly.
 */

/** Builds full bootstrap prompt lines. */
export function buildFullBootstrapPromptLines(..._args: unknown[]): string[] {
  // Cross-wms does not have the full bootstrap prompt assembler.
  return [];
}

/** Builds limited bootstrap prompt lines. */
export function buildLimitedBootstrapPromptLines(..._args: unknown[]): string[] {
  // Cross-wms does not have the limited bootstrap prompt assembler.
  return [];
}
