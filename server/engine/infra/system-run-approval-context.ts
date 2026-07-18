// 移植自 openclaw/src/infra/system-run-approval-context.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PreparedRunExecPolicy = unknown;
export function parsePreparedSystemRunPayload(...args: unknown[]): unknown {
  throw new Error("not implemented: parsePreparedSystemRunPayload");
}
export function resolveSystemRunApprovalRequestContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSystemRunApprovalRequestContext");
}
export function resolveSystemRunApprovalRuntimeContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSystemRunApprovalRuntimeContext");
}
