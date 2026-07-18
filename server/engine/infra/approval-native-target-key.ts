// 移植自 openclaw/src/infra/approval-native-target-key.ts（降级实现）
// channel-native 审批目标键解析。
import { normalizeOptionalString } from "./string-coerce.js";

export type ApprovalNativeTargetKey = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string | number;
};

/**
 * 构建 channel-native 审批目标键。
 */
export function buildApprovalNativeTargetKey(params: {
  channel: string;
  to: string;
  accountId?: string | null;
  threadId?: string | number | null;
}): ApprovalNativeTargetKey {
  const key: ApprovalNativeTargetKey = {
    channel: params.channel,
    to: params.to,
  };
  const accountId = normalizeOptionalString(params.accountId);
  if (accountId) key.accountId = accountId;
  if (typeof params.threadId === "number") {
    if (Number.isFinite(params.threadId)) key.threadId = params.threadId;
  } else if (typeof params.threadId === "string") {
    const trimmed = params.threadId.trim();
    if (trimmed) key.threadId = trimmed;
  }
  return key;
}

/** 将目标键序列化为字符串 */
export function serializeApprovalNativeTargetKey(key: ApprovalNativeTargetKey): string {
  const parts = [key.channel, key.to];
  if (key.accountId) parts.push(key.accountId);
  if (key.threadId !== undefined) parts.push(String(key.threadId));
  return parts.join(":");
}

/** 比较两个目标键是否相等 */
export function approvalNativeTargetKeysEqual(
  a: ApprovalNativeTargetKey,
  b: ApprovalNativeTargetKey,
): boolean {
  return (
    a.channel === b.channel &&
    a.to === b.to &&
    (a.accountId ?? "") === (b.accountId ?? "") &&
    String(a.threadId ?? "") === String(b.threadId ?? "")
  );
}
