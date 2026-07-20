/**
 * 移植自 openclaw/src/agents/bash-tools.exec-approval-followup-state.ts
 *
 * Runtime handoff state for exec approval follow-up turns.
 * Simplified for cross-wms: uses in-memory map; no SQLite; inlined
 * normalization helpers.
 */

import { randomUUID } from "node:crypto";

type ExecElevatedDefaults = {
  enabled: boolean;
  allowed: string[];
  defaultLevel: string;
  fullAccessAvailable?: boolean;
  fullAccessBlockedReason?: string;
};

const EXEC_APPROVAL_FOLLOWUP_IDEMPOTENCY_PREFIX = "exec-approval-followup:";
const EXEC_APPROVAL_FOLLOWUP_IDEMPOTENCY_NONCE_MARKER = ":nonce:";
const EXEC_APPROVAL_FOLLOWUP_RUNTIME_HANDOFF_TTL_MS = 5 * 60 * 1000;

type ExecApprovalFollowupRuntimeHandoff = {
  kind: "exec-approval-followup";
  approvalId: string;
  sessionKey: string;
  idempotencyKey: string;
  bashElevated: ExecElevatedDefaults;
};

type ExecApprovalFollowupRuntimeHandoffEntry = ExecApprovalFollowupRuntimeHandoff & {
  expiresAtMs: number;
};

const handoffs = new Map<string, ExecApprovalFollowupRuntimeHandoffEntry>();

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function pruneExpiredHandoffs(nowMs: number): void {
  for (const [handoffId, entry] of handoffs) {
    if (entry.expiresAtMs <= nowMs) {
      handoffs.delete(handoffId);
    }
  }
}

/** Build the idempotency key used for an exec approval follow-up. */
export function buildExecApprovalFollowupIdempotencyKey(params: {
  approvalId: string;
  nonce?: string;
}): string {
  const base = `${EXEC_APPROVAL_FOLLOWUP_IDEMPOTENCY_PREFIX}${params.approvalId}`;
  const nonce = normalizeOptionalString(params.nonce);
  return nonce ? `${base}${EXEC_APPROVAL_FOLLOWUP_IDEMPOTENCY_NONCE_MARKER}${nonce}` : base;
}

/** Parse the approval id embedded in a follow-up idempotency key. */
export function parseExecApprovalFollowupApprovalId(idempotencyKey: string): string | undefined {
  const normalized = normalizeOptionalString(idempotencyKey);
  if (!normalized?.startsWith(EXEC_APPROVAL_FOLLOWUP_IDEMPOTENCY_PREFIX)) {
    return undefined;
  }
  const body = normalized.slice(EXEC_APPROVAL_FOLLOWUP_IDEMPOTENCY_PREFIX.length);
  const nonceMarker = body.lastIndexOf(EXEC_APPROVAL_FOLLOWUP_IDEMPOTENCY_NONCE_MARKER);
  return normalizeOptionalString(nonceMarker >= 0 ? body.slice(0, nonceMarker) : body);
}

/** Register a short-lived exec approval handoff for the next follow-up turn. */
export function registerExecApprovalFollowupRuntimeHandoff(params: {
  approvalId: string;
  sessionKey: string;
  bashElevated?: ExecElevatedDefaults;
  nowMs?: number;
}): { handoffId: string; idempotencyKey: string } | undefined {
  const approvalId = normalizeOptionalString(params.approvalId);
  const sessionKey = normalizeOptionalString(params.sessionKey);
  if (!approvalId || !sessionKey || !params.bashElevated) {
    return undefined;
  }
  const nowMs = params.nowMs ?? Date.now();
  pruneExpiredHandoffs(nowMs);
  const expiresAtMs = nowMs + EXEC_APPROVAL_FOLLOWUP_RUNTIME_HANDOFF_TTL_MS;
  const handoffId = randomUUID();
  const idempotencyKey = buildExecApprovalFollowupIdempotencyKey({
    approvalId,
    nonce: randomUUID(),
  });
  handoffs.set(handoffId, {
    kind: "exec-approval-followup",
    approvalId,
    sessionKey,
    idempotencyKey,
    bashElevated: { ...params.bashElevated, allowed: [...params.bashElevated.allowed] },
    expiresAtMs,
  });
  return { handoffId, idempotencyKey };
}

/** Consume a matching handoff once, validating approval/session/idempotency data. */
export function consumeExecApprovalFollowupRuntimeHandoff(params: {
  handoffId?: string;
  approvalId?: string;
  idempotencyKey?: string;
  sessionKey?: string;
  nowMs?: number;
}): ExecApprovalFollowupRuntimeHandoff | undefined {
  const handoffId = normalizeOptionalString(params.handoffId);
  const approvalId = normalizeOptionalString(params.approvalId);
  const idempotencyKey = normalizeOptionalString(params.idempotencyKey);
  if (!handoffId || !approvalId || !idempotencyKey) {
    return undefined;
  }
  const nowMs = params.nowMs ?? Date.now();
  pruneExpiredHandoffs(nowMs);
  const entry = handoffs.get(handoffId);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAtMs <= nowMs) {
    handoffs.delete(handoffId);
    return undefined;
  }
  const sessionKey = normalizeOptionalString(params.sessionKey);
  if (
    entry.approvalId !== approvalId ||
    entry.idempotencyKey !== idempotencyKey ||
    entry.sessionKey !== sessionKey
  ) {
    return undefined;
  }
  handoffs.delete(handoffId);
  return {
    kind: entry.kind,
    approvalId: entry.approvalId,
    sessionKey: entry.sessionKey,
    idempotencyKey: entry.idempotencyKey,
    bashElevated: { ...entry.bashElevated, allowed: [...entry.bashElevated.allowed] },
  };
}

/** Check whether a followup session has been rebound. */
export function isExecApprovalFollowupSessionRebound(params: {
  expectedSessionId?: string;
  resolvedSessionId?: string;
}): boolean {
  const expected = normalizeOptionalString(params.expectedSessionId);
  const resolved = normalizeOptionalString(params.resolvedSessionId);
  return Boolean(expected && resolved && expected !== resolved);
}

/** Clear exec approval follow-up handoffs between tests. */
export function resetExecApprovalFollowupRuntimeHandoffsForTests(): void {
  handoffs.clear();
}
