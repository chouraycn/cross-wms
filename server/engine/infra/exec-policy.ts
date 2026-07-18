// 移植自 openclaw/src/infra/exec-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecPolicyLayer = unknown;
export function applyExecPolicyLayer(...args: unknown[]): unknown {
  throw new Error("not implemented: applyExecPolicyLayer");
}
