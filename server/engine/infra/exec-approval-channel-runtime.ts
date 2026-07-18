// 移植自 openclaw/src/infra/exec-approval-channel-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecApprovalChannelRuntime = unknown;
export type ExecApprovalChannelRuntimeAdapter = unknown;
export type ExecApprovalChannelRuntimeEventKind = unknown;
export function isExecApprovalChannelRuntimeTerminalStartError(...args: unknown[]): unknown {
  throw new Error("not implemented: isExecApprovalChannelRuntimeTerminalStartError");
}
export function createExecApprovalChannelRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: createExecApprovalChannelRuntime");
}
export class ExecApprovalChannelRuntimeTerminalStartError {
  constructor(...args: unknown[]) { throw new Error("not implemented: ExecApprovalChannelRuntimeTerminalStartError"); }
}
