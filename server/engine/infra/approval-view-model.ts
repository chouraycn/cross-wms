// 移植自 openclaw/src/infra/approval-view-model.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function buildPendingApprovalView(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPendingApprovalView");
}
export function buildResolvedApprovalView(...args: unknown[]): unknown {
  throw new Error("not implemented: buildResolvedApprovalView");
}
export function buildExpiredApprovalView(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExpiredApprovalView");
}
