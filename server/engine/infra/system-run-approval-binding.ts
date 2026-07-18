// 移植自 openclaw/src/infra/system-run-approval-binding.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SystemRunApprovalMatchResult = unknown;
export function normalizeSystemRunApprovalPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeSystemRunApprovalPlan");
}
export function buildSystemRunApprovalEnvBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: buildSystemRunApprovalEnvBinding");
}
export function buildSystemRunApprovalBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: buildSystemRunApprovalBinding");
}
export function matchSystemRunApprovalEnvHash(...args: unknown[]): unknown {
  throw new Error("not implemented: matchSystemRunApprovalEnvHash");
}
export function matchSystemRunApprovalBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: matchSystemRunApprovalBinding");
}
export function missingSystemRunApprovalBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: missingSystemRunApprovalBinding");
}
export function toSystemRunApprovalMismatchError(...args: unknown[]): unknown {
  throw new Error("not implemented: toSystemRunApprovalMismatchError");
}
