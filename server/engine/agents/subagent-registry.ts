/**
 * 移植自 openclaw/src/agents/subagent-registry.ts
 *
 * cross-wms 降级实现：保留导出签名，内部使用内存 Map 管理子代理运行。
 * 不依赖磁盘持久化、context engine、gateway 等完整 OpenClaw 基础设施。
 */

export { getSubagentSessionRuntimeMs, getSubagentSessionStartedAt, resolveSubagentSessionStatus } from "./subagent-registry-helpers.js";
export { listSessionMaintenanceProtectedSubagentSessionKeys } from "./subagent-registry-maintenance.js";
export type { SubagentRunRecord } from "./subagent-registry.types.js";

// ---- In-memory subagent run storage ----
const subagentRuns = new Map<string, import("./subagent-registry.types.js").SubagentRunRecord>();

let lastOrphanRecoveryScheduleAt = 0;
const ORPHAN_RECOVERY_DEBOUNCE_MS = 1_000;

export function scheduleSubagentOrphanRecovery(params?: { delayMs?: number; maxRetries?: number }) {
  const now = Date.now();
  if (now - lastOrphanRecoveryScheduleAt < ORPHAN_RECOVERY_DEBOUNCE_MS) {
    return;
  }
  lastOrphanRecoveryScheduleAt = now;
  // Best-effort: no actual orphan recovery in cross-wms
}

export function markSubagentRunForSteerRestart(runId: string) {
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return;
  }
  entry.suppressAnnounceReason = "steer-restart";
}

export function clearSubagentRunSteerRestart(runId: string) {
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return;
  }
  if (entry.suppressAnnounceReason === "steer-restart") {
    entry.suppressAnnounceReason = undefined;
  }
}

export function replaceSubagentRunAfterSteer(params: {
  previousRunId: string;
  nextRunId: string;
  fallback?: import("./subagent-registry.types.js").SubagentRunRecord;
  runTimeoutSeconds?: number;
  preserveFrozenResultFallback?: boolean;
  transcriptFile?: string;
}) {
  const previous = subagentRuns.get(params.previousRunId);
  if (!previous) {
    if (params.fallback) {
      subagentRuns.set(params.nextRunId, params.fallback);
    }
    return;
  }
  const next: import("./subagent-registry.types.js").SubagentRunRecord = {
    ...previous,
    runId: params.nextRunId,
    runTimeoutSeconds: params.runTimeoutSeconds ?? previous.runTimeoutSeconds,
    suppressAnnounceReason: undefined,
    endedAt: undefined as unknown as number,
    outcome: undefined,
    cleanupCompletedAt: undefined as unknown as number,
    cleanupHandled: false,
  };
  if (params.transcriptFile) {
    next.execution = { ...next.execution, transcriptFile: params.transcriptFile };
  }
  subagentRuns.delete(params.previousRunId);
  subagentRuns.set(params.nextRunId, next);
}

export function registerSubagentRun(params: {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: unknown;
  workspaceDir?: string;
  agentDir?: string;
  cleanup?: "delete" | "keep";
  runTimeoutSeconds?: number;
  spawnMode?: string;
  createdAt?: number;
  [key: string]: unknown;
}) {
  const entry = {
    runId: params.runId,
    childSessionKey: params.childSessionKey,
    requesterSessionKey: params.requesterSessionKey,
    requesterOrigin: params.requesterOrigin,
    workspaceDir: params.workspaceDir,
    agentDir: params.agentDir,
    cleanup: params.cleanup ?? "keep",
    runTimeoutSeconds: params.runTimeoutSeconds,
    spawnMode: params.spawnMode ?? "inline",
    createdAt: params.createdAt ?? Date.now(),
    cleanupHandled: false,
  } as import("./subagent-registry.types.js").SubagentRunRecord;
  subagentRuns.set(params.runId, entry);
}

export function resetSubagentRegistryForTests(opts?: { persist?: boolean }) {
  subagentRuns.clear();
  lastOrphanRecoveryScheduleAt = 0;
}

export function addSubagentRunForTests(entry: import("./subagent-registry.types.js").SubagentRunRecord) {
  subagentRuns.set(entry.runId, entry);
}

export function releaseSubagentRun(runId: string) {
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return;
  }
  entry.cleanupHandled = true;
  subagentRuns.delete(runId);
}

export async function finalizeInterruptedSubagentRun(params: {
  runId?: string;
  childSessionKey?: string;
  error: string;
  endedAt?: number;
}): Promise<number> {
  const runIds = new Set<string>();
  if (typeof params.runId === "string" && params.runId.trim()) {
    runIds.add(params.runId.trim());
  }
  if (typeof params.childSessionKey === "string" && params.childSessionKey.trim()) {
    const childSessionKey = params.childSessionKey.trim();
    for (const [runId, entry] of subagentRuns.entries()) {
      if (entry.childSessionKey === childSessionKey) {
        runIds.add(runId);
      }
    }
  }
  if (runIds.size === 0) {
    return 0;
  }

  const endedAt =
    typeof params.endedAt === "number" && Number.isFinite(params.endedAt)
      ? params.endedAt
      : Date.now();
  let updated = 0;
  for (const runId of runIds) {
    const entry = subagentRuns.get(runId);
    if (!entry || typeof entry.cleanupCompletedAt === "number") {
      continue;
    }
    entry.endedAt = endedAt;
    entry.outcome = { status: "error", error: params.error };
    entry.cleanupHandled = true;
    updated += 1;
  }
  return updated;
}

export function resolveRequesterForChildSession(childSessionKey: string): {
  requesterSessionKey: string;
  requesterOrigin?: unknown;
} | null {
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey === childSessionKey) {
      return {
        requesterSessionKey: entry.requesterSessionKey,
        requesterOrigin: entry.requesterOrigin,
      };
    }
  }
  return null;
}

export function isSubagentSessionRunActive(childSessionKey: string): boolean {
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey === childSessionKey && typeof entry.endedAt !== "number") {
      return true;
    }
  }
  return false;
}

export function shouldIgnorePostCompletionAnnounceForSession(childSessionKey: string): boolean {
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey === childSessionKey && entry.suppressAnnounceReason === "steer-restart") {
      return true;
    }
  }
  return false;
}

export function markSubagentRunTerminated(params: {
  runId?: string;
  childSessionKey?: string;
  reason?: string;
}): number {
  let count = 0;
  if (typeof params.runId === "string" && params.runId.trim()) {
    const entry = subagentRuns.get(params.runId.trim());
    if (entry && typeof entry.endedAt !== "number") {
      entry.endedAt = Date.now();
      entry.outcome = { status: "error", error: params.reason ?? "terminated" };
      count += 1;
    }
  }
  if (typeof params.childSessionKey === "string" && params.childSessionKey.trim()) {
    for (const entry of subagentRuns.values()) {
      if (entry.childSessionKey === params.childSessionKey && typeof entry.endedAt !== "number") {
        entry.endedAt = Date.now();
        entry.outcome = { status: "error", error: params.reason ?? "terminated" };
        count += 1;
      }
    }
  }
  return count;
}

export function listSubagentRunsForRequester(
  requesterSessionKey: string,
  options?: { requesterRunId?: string },
): import("./subagent-registry.types.js").SubagentRunRecord[] {
  const results: import("./subagent-registry.types.js").SubagentRunRecord[] = [];
  for (const entry of subagentRuns.values()) {
    if (entry.requesterSessionKey === requesterSessionKey) {
      if (!options?.requesterRunId || entry.requesterRunId === options.requesterRunId) {
        results.push(entry);
      }
    }
  }
  return results;
}

export function leasePendingAgentSteeringItems(params: {
  requesterSessionKey: string;
  leaseId: string;
  now?: number;
}) {
  // No steering queue in cross-wms; return empty
  return undefined;
}

export function ackPendingAgentSteeringItems(params: {
  runIds: readonly string[];
  leaseId: string;
  now?: number;
}): number {
  return 0;
}

export function releasePendingAgentSteeringItems(params: {
  runIds: readonly string[];
  leaseId: string;
  error?: string;
}): number {
  return 0;
}

export function listSubagentRunsForController(controllerSessionKey: string): import("./subagent-registry.types.js").SubagentRunRecord[] {
  const results: import("./subagent-registry.types.js").SubagentRunRecord[] = [];
  for (const entry of subagentRuns.values()) {
    if (entry.requesterSessionKey === controllerSessionKey) {
      results.push(entry);
    }
  }
  return results;
}

export function countActiveRunsForSession(requesterSessionKey: string): number {
  let count = 0;
  for (const entry of subagentRuns.values()) {
    if (entry.requesterSessionKey === requesterSessionKey && typeof entry.endedAt !== "number") {
      count += 1;
    }
  }
  return count;
}

export function countActiveDescendantRuns(rootSessionKey: string): number {
  let count = 0;
  for (const entry of subagentRuns.values()) {
    if (entry.requesterSessionKey === rootSessionKey && typeof entry.endedAt !== "number") {
      count += 1;
    }
  }
  return count;
}

export function countPendingDescendantRuns(rootSessionKey: string): number {
  let count = 0;
  for (const entry of subagentRuns.values()) {
    if (entry.requesterSessionKey === rootSessionKey && typeof entry.endedAt !== "number") {
      count += 1;
    }
  }
  return count;
}

export function countPendingDescendantRunsExcludingRun(
  rootSessionKey: string,
  excludeRunId: string,
): number {
  let count = 0;
  for (const entry of subagentRuns.values()) {
    if (
      entry.requesterSessionKey === rootSessionKey &&
      typeof entry.endedAt !== "number" &&
      entry.runId !== excludeRunId
    ) {
      count += 1;
    }
  }
  return count;
}

export function listDescendantRunsForRequester(rootSessionKey: string): import("./subagent-registry.types.js").SubagentRunRecord[] {
  const results: import("./subagent-registry.types.js").SubagentRunRecord[] = [];
  for (const entry of subagentRuns.values()) {
    if (entry.requesterSessionKey === rootSessionKey) {
      results.push(entry);
    }
  }
  return results;
}

export function getSubagentRunByChildSessionKey(childSessionKey: string): import("./subagent-registry.types.js").SubagentRunRecord | null {
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey === childSessionKey) {
      return entry;
    }
  }
  return null;
}

export function getLatestSubagentRunByChildSessionKey(
  childSessionKey: string,
): import("./subagent-registry.types.js").SubagentRunRecord | null {
  const key = childSessionKey.trim();
  if (!key) {
    return null;
  }

  let latest: import("./subagent-registry.types.js").SubagentRunRecord | null = null;
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey !== key) {
      continue;
    }
    if (!latest || entry.createdAt > latest.createdAt) {
      latest = entry;
    }
  }

  return latest;
}

export function initSubagentRegistry() {
  // No-op in cross-wms: no disk restore needed
}

export const testing = {
  async sweepOnceForTests() {
    // No-op in cross-wms
  },
  setDepsForTest(overrides?: unknown) {
    // No-op in cross-wms
  },
} as const;
