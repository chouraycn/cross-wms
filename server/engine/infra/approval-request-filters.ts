// 移植自 openclaw/src/infra/approval-request-filters.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ApprovalRequestFilterInput = unknown;
export function matchesApprovalRequestSessionFilter(...args: unknown[]): unknown {
  throw new Error("not implemented: matchesApprovalRequestSessionFilter");
}
export function matchesApprovalRequestFilters(...args: unknown[]): unknown {
  throw new Error("not implemented: matchesApprovalRequestFilters");
}
