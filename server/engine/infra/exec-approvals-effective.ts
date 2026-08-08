// 移植自 openclaw/src/infra/exec-approvals-effective.ts

export type ExecPolicyScopeSnapshot = unknown;
export function collectExecPolicyScopeSnapshots(...args: any[]): any {
  return [];
}
export function resolveExecPolicyScopeSnapshot(...args: any[]): any {
  return undefined;
}
