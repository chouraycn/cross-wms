// 移植自 openclaw/src/gateway/server/readiness.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ReadinessResult = unknown;

export type ReadinessChecker = unknown;

export function createReadinessChecker(...args: unknown[]): unknown {
  throw new Error("not implemented: createReadinessChecker");
}
