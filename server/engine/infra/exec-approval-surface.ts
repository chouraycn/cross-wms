// 移植自 openclaw/src/infra/exec-approval-surface.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecApprovalInitiatingSurfaceState = unknown;
export function resolveExecApprovalInitiatingSurfaceState(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecApprovalInitiatingSurfaceState");
}
export function resolveApprovalInitiatingSurfaceState(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalInitiatingSurfaceState");
}
export function supportsNativeExecApprovalClient(...args: unknown[]): unknown {
  throw new Error("not implemented: supportsNativeExecApprovalClient");
}
export function listNativeExecApprovalClientLabels(...args: unknown[]): unknown {
  throw new Error("not implemented: listNativeExecApprovalClientLabels");
}
export function describeNativeExecApprovalClientSetup(...args: unknown[]): unknown {
  throw new Error("not implemented: describeNativeExecApprovalClientSetup");
}
