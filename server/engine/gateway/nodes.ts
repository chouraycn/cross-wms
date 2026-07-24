// 移植自 openclaw/src/gateway/server-methods/nodes.ts

export const clearNodeWakeState: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;

export const NODE_WAKE_RECONNECT_RETRY_WAIT_MS: unknown = undefined as unknown;

export const NODE_WAKE_RECONNECT_WAIT_MS: unknown = undefined as unknown;

export async function maybeWakeNodeWithApns(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function maybeSendNodeWakeNudge(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function waitForNodeReconnect(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export const nodeHandlers: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
