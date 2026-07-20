/**
 * Ported from openclaw/src/agents/fast-mode.ts
 *
 * Resolves fast-mode state from agent config and runtime defaults.
 * Cross-wms degradation: returns default fast-mode state (disabled) without
 * config/session resolution.
 */

/** Fast-mode state resolved for an agent session. */
type FastModeState = {
  mode: boolean | string;
  enabled: boolean;
  source: string;
  fastAutoOnSeconds: number;
};

/** Resolve the effective fast-mode setting and its source. */
export function resolveFastModeState(params: {
  cfg?: Record<string, unknown>;
  provider: string;
  model: string;
  agentId?: string;
  sessionEntry?: Record<string, unknown>;
}): FastModeState {
  // Cross-wms does not have agent config resolution for fast-mode.
  // Check session entry for a fastMode override.
  const sessionFastMode = params.sessionEntry?.fastMode;
  if (sessionFastMode !== undefined && sessionFastMode !== null) {
    const enabled = sessionFastMode === true || sessionFastMode === "auto";
    return {
      mode: sessionFastMode as boolean | string,
      enabled,
      source: "session",
      fastAutoOnSeconds: 0,
    };
  }
  return {
    mode: false,
    enabled: false,
    source: "default",
    fastAutoOnSeconds: 0,
  };
}
