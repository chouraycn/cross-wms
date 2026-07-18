// 移植自 openclaw/src/infra/approval-request-account-binding.ts（降级实现）
// 审批请求与账户绑定。
import type { OpenClawConfig } from "./_runtime-stubs.js";
import type { ApprovalRequest } from "./approval-handler-runtime-types.js";

export type ApprovalRequestAccountBinding = {
  approvalId: string;
  channel: string;
  accountId?: string;
  sessionKey?: string;
  boundAtMs: number;
};

export type PersistedApprovalRequestSessionEntry = {
  entry: unknown;
  binding: ApprovalRequestAccountBinding;
};

/**
 * 判断审批请求是否匹配通道账户。
 * 降级实现：返回 false。
 */
export function doesApprovalRequestMatchChannelAccount(_params: {
  cfg: OpenClawConfig;
  request: ApprovalRequest;
  channel: string;
  accountId?: string | null;
}): boolean {
  return false;
}

/**
 * 解析持久化的审批请求会话条目。
 * 降级实现：返回 null。
 */
export function resolvePersistedApprovalRequestSessionEntry(_params: {
  cfg: OpenClawConfig;
  request: ApprovalRequest;
}): PersistedApprovalRequestSessionEntry | null {
  return null;
}

/** 绑定审批请求到通道账户（降级：noop） */
export function bindApprovalRequestToChannelAccount(_params: {
  cfg: OpenClawConfig;
  request: ApprovalRequest;
  channel: string;
  accountId?: string;
}): ApprovalRequestAccountBinding | null {
  return null;
}

/** 解绑审批请求（降级：noop） */
export function unbindApprovalRequest(_params: {
  cfg: OpenClawConfig;
  approvalId: string;
}): void {
  // 降级：noop
}

export type { ApprovalRequest };
