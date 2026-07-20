/**
 * 移植自 openclaw/src/agents/spawned-context.ts
 *
 * Spawned run metadata helpers.
 * Projects tool runtime context into persisted lineage, group routing, workspace, and inherited policy metadata.
 */

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export type SpawnedRunMetadata = {
  spawnedBy?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  workspaceDir?: string | null;
};

export type SpawnedToolContext = {
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  agentMemberRoleIds?: string[];
  workspaceDir?: string;
  inheritedToolAllowlist?: string[];
  inheritedToolDenylist?: string[];
};

type NormalizedSpawnedRunMetadata = {
  spawnedBy?: string;
  groupId?: string;
  groupChannel?: string;
  groupSpace?: string;
  workspaceDir?: string;
};

/** Normalize optional spawn metadata fields from persisted or tool-provided input. */
export function normalizeSpawnedRunMetadata(
  value?: SpawnedRunMetadata | null,
): NormalizedSpawnedRunMetadata {
  return {
    spawnedBy: normalizeOptionalString(value?.spawnedBy),
    groupId: normalizeOptionalString(value?.groupId),
    groupChannel: normalizeOptionalString(value?.groupChannel),
    groupSpace: normalizeOptionalString(value?.groupSpace),
    workspaceDir: normalizeOptionalString(value?.workspaceDir),
  };
}

/** Project tool runtime context down to the persisted spawned-run metadata shape. */
export function mapToolContextToSpawnedRunMetadata(
  value?: SpawnedToolContext | null,
): Pick<NormalizedSpawnedRunMetadata, "groupId" | "groupChannel" | "groupSpace" | "workspaceDir"> {
  return {
    groupId: normalizeOptionalString(value?.agentGroupId),
    groupChannel: normalizeOptionalString(value?.agentGroupChannel),
    groupSpace: normalizeOptionalString(value?.agentGroupSpace),
    workspaceDir: normalizeOptionalString(value?.workspaceDir),
  };
}

/** Resolve which workspace a spawned run should inherit. */
export function resolveSpawnedWorkspaceInheritance(params: {
  config?: unknown;
  targetAgentId?: string;
  requesterSessionKey?: string;
  explicitWorkspaceDir?: string | null;
}): string | undefined {
  const explicit = normalizeOptionalString(params.explicitWorkspaceDir);
  if (explicit) {
    return explicit;
  }
  return undefined;
}

/** Return a spawned run's ingress workspace override only for child runs. */
export function resolveIngressWorkspaceOverrideForSpawnedRun(
  metadata?: Pick<SpawnedRunMetadata, "spawnedBy" | "workspaceDir"> | null,
): string | undefined {
  const normalized = normalizeSpawnedRunMetadata(metadata);
  return normalized.spawnedBy ? normalized.workspaceDir : undefined;
}
