// 移植自 openclaw/src/infra/exec-approval-session-target.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecApprovalSessionTarget = unknown;
export type ApprovalRequestSessionConversation = unknown;
export function resolveApprovalRequestSessionConversation(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalRequestSessionConversation");
}
export function resolveExecApprovalSessionTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalSessionTarget");
}
export function resolveApprovalRequestSessionTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalRequestSessionTarget");
}
export function resolveApprovalRequestOriginTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalRequestOriginTarget");
}
