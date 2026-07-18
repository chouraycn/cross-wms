// 移植自 openclaw/src/gateway/server/ws-connection/auth-context.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConnectAuthState = unknown;

export async function resolveConnectAuthState(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveConnectAuthState");
}

export async function resolveConnectAuthDecision(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveConnectAuthDecision");
}
