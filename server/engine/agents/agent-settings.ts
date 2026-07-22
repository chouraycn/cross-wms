/**
 * Agent-level settings and configuration resolution.
 * Ported from openclaw/src/agents/agent-settings.ts
 *
 * Note: Full settings infrastructure not available in cross-wms.
 */

type AgentConfig = {
  agentId?: string;
  model?: string;
  provider?: string;
  thinkingLevel?: string;
  tools?: Record<string, unknown>;
  systemPrompt?: string;
  permissions?: Record<string, unknown>;
  maxTurns?: number;
  [key: string]: unknown;
};

/** Resolve the effective agent config by merging CLI flags, workspace config, and defaults. */
export function resolveEffectiveAgentConfig(params: {
  cliFlags?: Record<string, unknown>;
  workspaceConfig?: unknown;
  agentId?: string;
  defaults?: Partial<AgentConfig>;
}): AgentConfig {
  const defaults = params.defaults ?? {};
  const workspace = params.workspaceConfig as Record<string, unknown> | undefined;
  const cli = params.cliFlags ?? {};
  return {
    agentId: (cli.agentId as string) ?? params.agentId ?? defaults.agentId,
    model: (cli.model as string) ?? (workspace?.model as string) ?? defaults.model,
    provider: (cli.provider as string) ?? (workspace?.provider as string) ?? defaults.provider,
    thinkingLevel:
      (cli.thinkingLevel as string) ??
      (workspace?.thinkingLevel as string) ??
      defaults.thinkingLevel,
    tools: {
      ...defaults.tools,
      ...((workspace?.tools as Record<string, unknown>) ?? {}),
      ...((cli.tools as Record<string, unknown>) ?? {}),
    },
    systemPrompt:
      (cli.systemPrompt as string) ?? (workspace?.systemPrompt as string) ?? defaults.systemPrompt,
    permissions: {
      ...defaults.permissions,
      ...((workspace?.permissions as Record<string, unknown>) ?? {}),
      ...((cli.permissions as Record<string, unknown>) ?? {}),
    },
    maxTurns: (cli.maxTurns as number) ?? (workspace?.maxTurns as number) ?? defaults.maxTurns,
  };
}

/** Validate agent config, returning warnings for any issues. */
export function validateAgentConfig(config: AgentConfig): string[] {
  const warnings: string[] = [];
  if (config.maxTurns !== undefined && config.maxTurns < 1) {
    warnings.push("maxTurns must be at least 1");
  }
  if (config.model === undefined || config.model === "") {
    warnings.push("No model specified; a model must be provided");
  }
  return warnings;
}

/** Merge per-tool permission overrides into an agent config. */
export function mergeToolPermissionOverrides(
  config: AgentConfig,
  toolName: string,
  overrides: Record<string, unknown>,
): AgentConfig {
  const currentPermissions = config.permissions?.[toolName] as Record<string, unknown> | undefined;
  return {
    ...config,
    permissions: {
      ...config.permissions,
      [toolName]: { ...currentPermissions, ...overrides },
    },
  };
}

/** Check whether an agent config has tool-specific permissions defined. */
export function hasToolPermission(config: AgentConfig, toolName: string): boolean {
  return config.permissions?.[toolName] !== undefined;
}

/** Extract the model identifier from an agent config or return a default. */
export function extractModelId(config: AgentConfig, fallback?: string): string | undefined {
  return config.model ?? fallback;
}

// ============================================================================
// Compaction guard compatibility exports.
// Full infrastructure (settings manager, context engine, provider attribution)
// is not available in cross-wms. These are no-op stubs that preserve module
// shape for callers ported from openclaw.
// ============================================================================

/** Default reserve-token floor for agent compaction. Mirrors openclaw default. */
export const DEFAULT_AGENT_COMPACTION_RESERVE_TOKENS_FLOOR = 20_000;

type AgentCompactionMode = "default" | "safeguard";

type AgentSettingsManagerLike = {
  getCompactionReserveTokens?: () => number;
  getCompactionKeepRecentTokens?: () => number;
  applyOverrides?: (overrides: {
    compaction: {
      reserveTokens?: number;
      keepRecentTokens?: number;
    };
  }) => void;
  setCompactionEnabled?: (enabled: boolean) => void;
};

/**
 * Compatibility stub for applying configured compaction reserve/keep-recent
 * settings. cross-wms has no live settings manager, so this is a no-op that
 * reports no overrides applied.
 */
export function applyAgentCompactionSettingsFromConfig(params: {
  settingsManager: AgentSettingsManagerLike;
  cfg?: unknown;
  contextTokenBudget?: number;
}): {
  didOverride: boolean;
  compaction: { reserveTokens: number; keepRecentTokens: number };
} {
  const reserveTokens = params.settingsManager.getCompactionReserveTokens?.() ?? 0;
  const keepRecentTokens = params.settingsManager.getCompactionKeepRecentTokens?.() ?? 0;
  return {
    didOverride: false,
    compaction: { reserveTokens, keepRecentTokens },
  };
}

/** Compatibility stub: always resolves to the default compaction mode. */
export function resolveEffectiveCompactionMode(_cfg?: unknown): AgentCompactionMode {
  return "default";
}

/** Compatibility stub: never classifies a model as silent-overflow-prone. */
export function isSilentOverflowProneModel(_model: {
  provider?: string | null;
  modelId?: string | null;
  baseUrl?: string | null;
}): boolean {
  return false;
}

/**
 * Compatibility stub for the auto-compaction guard. cross-wms has no live
 * settings manager with `setCompactionEnabled`, so this reports unsupported.
 */
export function applyAgentAutoCompactionGuard(params: {
  settingsManager: AgentSettingsManagerLike;
  contextEngineInfo?: unknown;
  compactionMode?: AgentCompactionMode;
  silentOverflowProneProvider?: boolean;
}): { supported: boolean; disabled: boolean } {
  const hasMethod = typeof params.settingsManager.setCompactionEnabled === "function";
  return { supported: hasMethod, disabled: false };
}
