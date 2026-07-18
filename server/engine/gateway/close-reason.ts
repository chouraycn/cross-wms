// 移植自 openclaw/src/gateway/server/close-reason.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function truncateCloseReason(...args: unknown[]): unknown {
  throw new Error("not implemented: truncateCloseReason");
}
