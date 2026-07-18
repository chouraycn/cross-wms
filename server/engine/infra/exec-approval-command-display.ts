// 移植自 openclaw/src/infra/exec-approval-command-display.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SanitizedExecApprovalDisplayText = unknown;
export function sanitizeExecApprovalDisplayText(...args: unknown[]): unknown {
  throw new Error("not implemented: sanitizeExecApprovalDisplayText");
}
export function sanitizeExecApprovalDisplayTextWithStatus(...args: unknown[]): unknown {
  throw new Error("not implemented: sanitizeExecApprovalDisplayTextWithStatus");
}
export function sanitizeExecApprovalWarningText(...args: unknown[]): unknown {
  throw new Error("not implemented: sanitizeExecApprovalWarningText");
}
export function resolveExecApprovalCommandDisplay(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalCommandDisplay");
}
