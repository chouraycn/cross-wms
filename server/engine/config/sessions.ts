// Public facade for session stores, metadata, lifecycle, reset, transcript, and cleanup APIs.
export * from "./sessions/combined-store-gateway.js";
export * from "./sessions/compaction-session-file.js";
export * from "./sessions/group.js";
export * from "./sessions/goals.js";
export * from "./sessions/artifacts.js";
export * from "./sessions/metadata.js";
export * from "./sessions/main-session.js";
export * from "./sessions/main-session.runtime.js";
export * from "./sessions/lifecycle.js";
export * from "./sessions/paths.js";
export * from "./sessions/reset.js";
export {
  canonicalizeSessionEntryAliases,
  deleteSessionEntryLifecycle,
  resetSessionEntryLifecycle,
  type CanonicalizeSessionEntryAliasesResult,
  type DeleteSessionEntryLifecycleParams,
  type DeleteSessionEntryLifecycleResult,
  type ResetSessionEntryLifecycleParams,
  type ResetSessionEntryLifecycleResult,
  type SessionLifecycleArchivedTranscript,
  type SessionLifecycleStoreTarget,
} from "./sessions/session-accessor.js";
export * from "./sessions/session-key.js";
export * from "./sessions/store.js";
export * from "./sessions/types.js";
export * from "./sessions/transcript.js";
export * from "./sessions/session-file.js";
export * from "./sessions/session-file-rotation.js";
export * from "./sessions/session-registry-maintenance.js";
export * from "./sessions/delivery-info.js";
export * from "./sessions/disk-budget.js";
export * from "./sessions/targets.js";
export * from "./sessions/cleanup-service.js";

export function snapshotSessionOrigin(params: {
  sessionKey: string;
}): { sessionKey: string; timestamp: number } {
  return {
    sessionKey: params.sessionKey,
    timestamp: Date.now(),
  };
}

export function evaluateSessionFreshness(params: {
  sessionKey: string;
  lastActivityAt?: number;
  nowMs?: number;
}): { isFresh: boolean; ageMs: number } {
  const nowMs = params.nowMs ?? Date.now();
  const ageMs = params.lastActivityAt ? nowMs - params.lastActivityAt : Number.POSITIVE_INFINITY;
  const isFresh = ageMs < 24 * 60 * 60 * 1000;
  return { isFresh, ageMs };
}

export type SessionResetPolicy = "never" | "daily" | "weekly" | "always";

export function resolveSessionResetPolicy(params: {
  cfg?: unknown;
  agentId?: string;
}): SessionResetPolicy {
  return "never";
}

export async function purgeAgentSessionStoreEntries(params: {
  agentId: string;
  olderThanMs?: number;
}): Promise<number> {
  return 0;
}

export async function runSessionsCleanup(params?: {
  dryRun?: boolean;
  maxAgeMs?: number;
}): Promise<{
  totalScanned: number;
  removed: number;
  freedBytes: number;
}> {
  return { totalScanned: 0, removed: 0, freedBytes: 0 };
}

export function serializeSessionCleanupResult(result: {
  totalScanned: number;
  removed: number;
  freedBytes: number;
}): string {
  return `Sessions cleanup: scanned=${result.totalScanned}, removed=${result.removed}, freed=${result.freedBytes} bytes`;
}
