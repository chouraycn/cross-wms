// 移植自 openclaw/src/infra/exec-approvals-effective.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecPolicyScopeSnapshot = unknown;
export function collectExecPolicyScopeSnapshots(...args: unknown[]): unknown {
  throw new Error("not implemented: collectExecPolicyScopeSnapshots");
}
export function resolveExecPolicyScopeSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecPolicyScopeSnapshot");
}
