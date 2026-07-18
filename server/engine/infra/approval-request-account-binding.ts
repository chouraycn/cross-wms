// 移植自 openclaw/src/infra/approval-request-account-binding.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolvePersistedApprovalRequestSessionEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePersistedApprovalRequestSessionEntry");
}
export function resolveApprovalRequestAccountId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalRequestAccountId");
}
export function resolveApprovalRequestChannelAccountId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalRequestChannelAccountId");
}
export function doesApprovalRequestMatchChannelAccount(...args: unknown[]): unknown {
  throw new Error("not implemented: doesApprovalRequestMatchChannelAccount");
}
