// 移植自 openclaw/src/gateway/server-methods/session-change-event.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SessionChangedPayload = unknown;

export function emitSessionsChanged(...args: unknown[]): unknown {
  throw new Error("not implemented: emitSessionsChanged");
}
