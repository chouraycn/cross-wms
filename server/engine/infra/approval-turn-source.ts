// 移植自 openclaw/src/infra/approval-turn-source.ts（降级实现）
// 解析发起审批请求的 turn source。
import { normalizeOptionalString } from "./string-coerce.js";
import type { ApprovalRequest } from "./approval-handler-runtime-types.js";

export type ApprovalTurnSource = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  sessionKey?: string;
};

/**
 * 从审批请求解析 turn source。
 */
export function resolveApprovalTurnSource(request: ApprovalRequest): ApprovalTurnSource {
  const req = request.request as {
    turnSourceChannel?: string | null;
    turnSourceTo?: string | null;
    turnSourceAccountId?: string | null;
    turnSourceThreadId?: string | number | null;
    sessionKey?: string | null;
  };
  const source: ApprovalTurnSource = {};
  const channel = normalizeOptionalString(req.turnSourceChannel);
  if (channel) source.channel = channel;
  const to = normalizeOptionalString(req.turnSourceTo);
  if (to) source.to = to;
  const accountId = normalizeOptionalString(req.turnSourceAccountId);
  if (accountId) source.accountId = accountId;
  if (typeof req.turnSourceThreadId === "number" && Number.isFinite(req.turnSourceThreadId)) {
    source.threadId = req.turnSourceThreadId;
  } else if (typeof req.turnSourceThreadId === "string") {
    const trimmed = req.turnSourceThreadId.trim();
    if (trimmed) source.threadId = trimmed;
  }
  const sessionKey = normalizeOptionalString(req.sessionKey);
  if (sessionKey) source.sessionKey = sessionKey;
  return source;
}

/** 判断 turn source 是否可用 */
export function hasApprovalTurnSource(source: ApprovalTurnSource): boolean {
  return Boolean(source.channel && source.to);
}

/** 比较两个 turn source 是否匹配 */
export function approvalTurnSourcesMatch(
  a: ApprovalTurnSource,
  b: ApprovalTurnSource,
): boolean {
  return (
    (a.channel ?? "") === (b.channel ?? "") &&
    (a.to ?? "") === (b.to ?? "") &&
    (a.accountId ?? "") === (b.accountId ?? "") &&
    String(a.threadId ?? "") === String(b.threadId ?? "")
  );
}

export type { ApprovalRequest };
