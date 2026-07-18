// 移植自 openclaw/src/gateway/server-methods/session-active-runs.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function hasTrackedActiveSessionRun(...args: unknown[]): unknown {
  throw new Error("not implemented: hasTrackedActiveSessionRun");
}
