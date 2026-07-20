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
  tools?: Record<string, unknown>;
  systemPrompt?: string;
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
};

type SettingsSnapshot = {
  settings: AgentProjectSettings;
  frozenAt: Date;
  source: string;
};

/** Freeze the current project-level agent settings into an immutable snapshot. */
export function freezeAgentProjectSettingsSnapshot(params: {
  config?: unknown;
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
): unknown {
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
