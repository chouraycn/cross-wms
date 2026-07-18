// 移植自 openclaw/src/gateway/server-methods/nodes.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const clearNodeWakeState: unknown = undefined;

export const NODE_WAKE_RECONNECT_RETRY_WAIT_MS: unknown = undefined;

export const NODE_WAKE_RECONNECT_WAIT_MS: unknown = undefined;

export async function maybeWakeNodeWithApns(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: maybeWakeNodeWithApns");
}

export async function maybeSendNodeWakeNudge(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: maybeSendNodeWakeNudge");
}

export async function waitForNodeReconnect(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: waitForNodeReconnect");
}

export const nodeHandlers: unknown = undefined;
