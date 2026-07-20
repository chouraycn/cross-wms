// 移植自 openclaw/src/infra/exec-approvals-effective.ts

export type ExecPolicyScopeSnapshot = unknown;
export function collectExecPolicyScopeSnapshots(...args: unknown[]): unknown {
  return [];
}
export function resolveExecPolicyScopeSnapshot(...args: unknown[]): unknown {
  return undefined;
}
