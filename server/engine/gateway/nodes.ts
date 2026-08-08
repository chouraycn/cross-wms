// 移植自 openclaw/src/gateway/server-methods/nodes.ts

export const clearNodeWakeState: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;

export const NODE_WAKE_RECONNECT_RETRY_WAIT_MS: any = undefined as any;

export const NODE_WAKE_RECONNECT_WAIT_MS: any = undefined as any;

export async function maybeWakeNodeWithApns(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function maybeSendNodeWakeNudge(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function waitForNodeReconnect(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export const nodeHandlers: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
