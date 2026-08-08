// 移植自 openclaw/src/gateway/server/ws-connection/auth-context.ts

export type ConnectAuthState = unknown;

export async function resolveConnectAuthState(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function resolveConnectAuthDecision(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
