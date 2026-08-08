/**
 * Agent project settings snapshot for consistent reads during a run.
 * Ported from openclaw/src/agents/agent-project-settings-snapshot.ts
 *
 * Note: Full settings infrastructure not available in cross-wms.
 */

type AgentProjectSettings = {
  agentId?: string;
  model?: string;
  thinkingLevel?: string;
  tools?: Record<string, any>;
  systemPrompt?: string;
  permissions?: Record<string, any>;
  [key: string]: any;
};

type SettingsSnapshot = {
  settings: AgentProjectSettings;
  frozenAt: Date;
  source: string;
};

/** Freeze the current project-level agent settings into an immutable snapshot. */
export function freezeAgentProjectSettingsSnapshot(params: {
  config?: any;
  agentId?: string;
  workspaceDir?: string;
}): SettingsSnapshot {
  // Full settings infrastructure not available in cross-wms
  return {
    settings: {},
    frozenAt: new Date(),
    source: "cross-wms-default",
  };
}

/** Read a value from a frozen settings snapshot. */
export function readSettingsSnapshotValue(
  snapshot: SettingsSnapshot,
  key: string,
): any {
  return snapshot.settings[key];
}

/** Merge project settings overrides on top of a base snapshot. */
export function mergeProjectSettingsOverrides(
  base: SettingsSnapshot,
  overrides: Partial<AgentProjectSettings>,
): SettingsSnapshot {
  return {
    ...base,
    settings: { ...base.settings, ...overrides },
    frozenAt: new Date(),
    source: base.source + "+overrides",
  };
}

/** Check whether a settings snapshot is still valid (not expired). */
export function isSettingsSnapshotValid(
  snapshot: SettingsSnapshot,
  options?: { maxAgeMs?: number },
): boolean {
  if (!options?.maxAgeMs) {
    return true;
  }
  const age = Date.now() - snapshot.frozenAt.getTime();
  return age < options.maxAgeMs;
}

// ============================================================================
// Embedded agent project settings policy stubs.
// Full embedded-agent settings infrastructure is not available in cross-wms;
// these provide module-shape compatibility for callers ported from openclaw.
// ============================================================================

export const DEFAULT_EMBEDDED_AGENT_PROJECT_SETTINGS_POLICY = Object.freeze({
  allowProjectOverrides: true,
  requireSnapshot: false,
  compactionReserveTokens: 0,
});

/** Stub: no enabled bundle-agent settings snapshot exists in cross-wms. */
export function loadEnabledBundleAgentSettingsSnapshot(_params?: any): SettingsSnapshot | undefined {
  return undefined;
}

/** Stub: resolves to the default policy (no project-level overrides). */
export function resolveEmbeddedAgentProjectSettingsPolicy(_params?: any): typeof DEFAULT_EMBEDDED_AGENT_PROJECT_SETTINGS_POLICY {
  return DEFAULT_EMBEDDED_AGENT_PROJECT_SETTINGS_POLICY;
}

/** Stub: builds an empty snapshot for the requested agent. */
export function buildEmbeddedAgentSettingsSnapshot(_params?: any): SettingsSnapshot {
  return {
    settings: {},
    frozenAt: new Date(),
    source: "cross-wms-default",
  };
}
