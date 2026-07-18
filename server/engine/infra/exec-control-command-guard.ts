// 移植自 openclaw/src/infra/exec-control-command-guard.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type UnsafeExecControlShellCommandKind = unknown;
export function parseExecApprovalShellCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: parseExecApprovalShellCommand");
}
export function parseOpenClawChannelsLoginShellCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: parseOpenClawChannelsLoginShellCommand");
}
export function detectUnsafeExecControlShellCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: detectUnsafeExecControlShellCommand");
}
export function rejectUnsafeExecControlShellCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: rejectUnsafeExecControlShellCommand");
}
