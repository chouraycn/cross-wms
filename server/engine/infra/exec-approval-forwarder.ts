// 移植自 openclaw/src/infra/exec-approval-forwarder.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecApprovalForwarder = unknown;
export function buildExecApprovalRequestMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExecApprovalRequestMessage");
}
export function createExecApprovalForwarder(...args: unknown[]): unknown {
  throw new Error("not implemented: createExecApprovalForwarder");
}
