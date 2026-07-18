// 移植自 openclaw/src/gateway/server-methods/nodes-wake-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const NODE_WAKE_RECONNECT_WAIT_MS: unknown = undefined;

export const NODE_WAKE_RECONNECT_RETRY_WAIT_MS: unknown = undefined;

export const NODE_WAKE_RECONNECT_POLL_MS: unknown = undefined;

export type NodeWakeAttempt = unknown;

export const nodeWakeById: unknown = undefined;

export const nodeWakeNudgeById: unknown = undefined;

export function clearNodeWakeState(...args: unknown[]): unknown {
  throw new Error("not implemented: clearNodeWakeState");
}

export const testing_nodes_wake_state: unknown = undefined;

export const __testing: unknown = undefined;
