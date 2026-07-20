/**
 * 移植自 openclaw/src/agents/agent-hooks/context-pruning/settings.ts
 *
 * Context pruning settings computation.
 * In cross-wms the full pruning settings infrastructure is not available,
 * so computeEffectiveSettings returns a default and the constant is provided.
 */

/** A tool match entry for context pruning. */
export type ContextPruningToolMatch = {
  name: string;
  keep?: boolean;
};

/** Effective context pruning settings. */
export type EffectiveContextPruningSettings = {
  enabled: boolean;
  toolMatches: ContextPruningToolMatch[];
};

/** Default context pruning settings (disabled). */
export const DEFAULT_CONTEXT_PRUNING_SETTINGS: EffectiveContextPruningSettings = {
  enabled: false,
  toolMatches: [],
};

/** Compute effective context pruning settings (returns disabled default in cross-wms). */
export function computeEffectiveSettings(..._args: unknown[]): EffectiveContextPruningSettings {
  return DEFAULT_CONTEXT_PRUNING_SETTINGS;
}
