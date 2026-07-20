// 移植自 openclaw/src/gateway/server-methods/session-change-event.ts

export type SessionChangedPayload = unknown;

export function emitSessionsChanged(...args: unknown[]): unknown {
  return undefined;
}
