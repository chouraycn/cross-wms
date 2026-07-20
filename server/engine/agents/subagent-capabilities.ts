/**
 * 移植自 openclaw/src/agents/subagent-capabilities.ts
 *
 * Subagent capability resolution.
 * Combines session-key shape, stored envelopes, spawn depth, and inherited tool
 * policy to decide role, control scope, and subagent permissions.
 *
 * Simplified for cross-wms: session store loading replaced with in-memory store,
 * session-key parsing simplified, and external config references removed.
 */

/** Resolved role for a main session, orchestrating subagent, or leaf subagent. */
export type SubagentSessionRole = "main" | "orchestrator" | "leaf";
const SUBAGENT_SESSION_ROLES: readonly SubagentSessionRole[] = [
  "main",
  "orchestrator",
  "leaf",
] as const;

type SubagentControlScope = "children" | "none";

type SessionCapabilityEntry = {
  sessionId?: unknown;
  spawnDepth?: unknown;
  subagentRole?: unknown;
  subagentControlScope?: unknown;
  spawnedBy?: unknown;
  inheritedToolAllow?: unknown;
  inheritedToolDeny?: unknown;
};

/** Minimal persisted session-store shape needed to resolve subagent capabilities. */
export type SessionCapabilityStore = Record<string, SessionCapabilityEntry>;

const DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH = 3;

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const str = normalizeOptionalString(value);
  return str?.toLowerCase();
}

function resolveIntegerOption(
  value: unknown,
  fallback: number,
  options?: { min?: number },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  if (options?.min !== undefined && truncated < options.min) return fallback;
  return truncated;
}

function resolveNonNegativeIntegerOption(value: unknown, fallback: number): number {
  const resolved = resolveIntegerOption(value, fallback);
  return Math.max(0, resolved);
}

function normalizeSubagentRole(value: unknown): SubagentSessionRole | undefined {
  const trimmed = normalizeOptionalLowercaseString(value);
  return SUBAGENT_SESSION_ROLES.find((entry) => entry === trimmed);
}

function normalizeSubagentControlScope(value: unknown): SubagentControlScope | undefined {
  const trimmed = normalizeOptionalLowercaseString(value);
  if (trimmed === "children" || trimmed === "none") return trimmed;
  return undefined;
}

function isSubagentSessionKey(sessionKey: string): boolean {
  // Subagent session keys contain "subagent" in their path
  return /[/:]subagent[:/]/i.test(sessionKey);
}

function isAcpSessionKey(sessionKey: string): boolean {
  // ACP session keys contain "acp" in their path
  return /[/:]acp[:/]/i.test(sessionKey);
}

function shouldInspectStoredSubagentEnvelope(sessionKey: string): boolean {
  return isSubagentSessionKey(sessionKey) || isAcpSessionKey(sessionKey);
}

// In-memory session store
const inMemorySessionStore: SessionCapabilityStore = {};

function findEntryBySessionId(
  store: SessionCapabilityStore,
  sessionId: string,
): SessionCapabilityEntry | undefined {
  const normalizedSessionId = normalizeOptionalString(sessionId);
  if (!normalizedSessionId) return undefined;
  for (const entry of Object.values(store)) {
    const candidateSessionId = normalizeOptionalString(entry?.sessionId);
    if (candidateSessionId === normalizedSessionId) {
      return entry;
    }
  }
  return undefined;
}

function resolveSessionCapabilityEntry(params: {
  sessionKey: string;
  store?: SessionCapabilityStore;
}): SessionCapabilityEntry | undefined {
  const store = params.store ?? inMemorySessionStore;
  return store[params.sessionKey] ?? findEntryBySessionId(store, params.sessionKey);
}

/** Resolve the session-store subset used for subagent capability lookup. */
export function resolveSubagentCapabilityStore(
  sessionKey: string | undefined | null,
  opts?: {
    store?: SessionCapabilityStore;
  },
): SessionCapabilityStore | undefined {
  const normalizedSessionKey = normalizeOptionalString(sessionKey);
  if (!normalizedSessionKey) {
    return opts?.store;
  }
  if (opts?.store) {
    return opts.store;
  }
  if (!shouldInspectStoredSubagentEnvelope(normalizedSessionKey)) {
    return undefined;
  }
  return inMemorySessionStore;
}

/** Resolve depth-derived role for a subagent position. */
function resolveSubagentRoleForDepth(params: {
  depth: number;
  maxSpawnDepth?: number;
}): SubagentSessionRole {
  const depth = resolveNonNegativeIntegerOption(params.depth, 0);
  const maxSpawnDepth = resolveIntegerOption(
    params.maxSpawnDepth,
    DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH,
    { min: 1 },
  );
  if (depth <= 0) {
    return "main";
  }
  return depth < maxSpawnDepth ? "orchestrator" : "leaf";
}

function resolveSubagentControlScopeForRole(role: SubagentSessionRole): SubagentControlScope {
  return role === "leaf" ? "none" : "children";
}

/** Resolve depth-derived role, scope, and spawn/control booleans. */
export function resolveSubagentCapabilities(params: { depth: number; maxSpawnDepth?: number }) {
  const depth = resolveNonNegativeIntegerOption(params.depth, 0);
  const role = resolveSubagentRoleForDepth(params);
  const controlScope = resolveSubagentControlScopeForRole(role);
  return {
    depth,
    role,
    controlScope,
    canSpawn: role === "main" || role === "orchestrator",
    canControlChildren: controlScope === "children",
  };
}

function getSubagentDepthFromSessionKey(sessionKey: string): number {
  // Parse depth from subagent session key pattern like "agent:id/subagent/1/..."
  const match = sessionKey.match(/subagent[:/](\d+)/i);
  if (match && match[1]) {
    return resolveNonNegativeIntegerOption(Number(match[1]), 0);
  }
  return 0;
}

function normalizeInheritedToolList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

/** Return true when a session key or persisted ACP envelope represents a subagent. */
export function isSubagentEnvelopeSession(
  sessionKey: string | undefined | null,
  opts?: {
    store?: SessionCapabilityStore;
    entry?: SessionCapabilityEntry;
  },
): boolean {
  const normalizedSessionKey = normalizeOptionalString(sessionKey);
  if (!normalizedSessionKey) return false;
  if (isSubagentSessionKey(normalizedSessionKey)) return true;
  if (!isAcpSessionKey(normalizedSessionKey)) return false;

  const store = opts?.store ?? inMemorySessionStore;
  const entry = opts?.entry ?? resolveSessionCapabilityEntry({ sessionKey: normalizedSessionKey, store });
  if (
    normalizeSubagentRole(entry?.subagentRole) ||
    normalizeSubagentControlScope(entry?.subagentControlScope)
  ) {
    return true;
  }
  const spawnedBy = normalizeOptionalString(entry?.spawnedBy);
  if (!spawnedBy) return false;
  // Follow parent links
  return isSubagentEnvelopeSession(spawnedBy, { store });
}

/**
 * Resolve the effective subagent role/scope, combining stored envelope metadata
 * with depth-derived fallback behavior.
 */
export function resolveStoredSubagentCapabilities(
  sessionKey: string | undefined | null,
  opts?: {
    store?: SessionCapabilityStore;
  },
) {
  const normalizedSessionKey = normalizeOptionalString(sessionKey);
  const maxSpawnDepth = DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH;
  if (!normalizedSessionKey) {
    return resolveSubagentCapabilities({ depth: 0, maxSpawnDepth });
  }

  const store = opts?.store ?? inMemorySessionStore;
  const depth = getSubagentDepthFromSessionKey(normalizedSessionKey);

  if (!shouldInspectStoredSubagentEnvelope(normalizedSessionKey)) {
    return resolveSubagentCapabilities({ depth, maxSpawnDepth });
  }

  const entry = resolveSessionCapabilityEntry({ sessionKey: normalizedSessionKey, store });
  if (!isSubagentEnvelopeSession(normalizedSessionKey, { store, entry })) {
    return resolveSubagentCapabilities({ depth, maxSpawnDepth });
  }

  const storedRole = normalizeSubagentRole(entry?.subagentRole);
  const fallback = resolveSubagentCapabilities({ depth, maxSpawnDepth });
  const role = storedRole ?? fallback.role;
  const controlScope = resolveSubagentControlScopeForRole(role);
  return {
    depth,
    role,
    controlScope,
    canSpawn: role === "main" || role === "orchestrator",
    canControlChildren: controlScope === "children",
  };
}

/** Resolve inherited tool deny rules stored on a subagent envelope. */
export function resolveStoredSubagentInheritedToolDenylist(
  sessionKey: string | undefined | null,
  opts?: {
    store?: SessionCapabilityStore;
  },
): string[] {
  const normalizedSessionKey = normalizeOptionalString(sessionKey);
  if (!normalizedSessionKey || !shouldInspectStoredSubagentEnvelope(normalizedSessionKey)) {
    return [];
  }
  const store = opts?.store ?? inMemorySessionStore;
  const entry = resolveSessionCapabilityEntry({ sessionKey: normalizedSessionKey, store });
  return normalizeInheritedToolList(entry?.inheritedToolDeny);
}

/** Resolve inherited tool allow rules stored on a subagent envelope. */
export function resolveStoredSubagentInheritedToolAllowlist(
  sessionKey: string | undefined | null,
  opts?: {
    store?: SessionCapabilityStore;
  },
): string[] {
  const normalizedSessionKey = normalizeOptionalString(sessionKey);
  if (!normalizedSessionKey || !shouldInspectStoredSubagentEnvelope(normalizedSessionKey)) {
    return [];
  }
  const store = opts?.store ?? inMemorySessionStore;
  const entry = resolveSessionCapabilityEntry({ sessionKey: normalizedSessionKey, store });
  return normalizeInheritedToolList(entry?.inheritedToolAllow);
}
