// 移植自 openclaw/src/infra/channel-activity.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelDirection = unknown;
export function recordChannelActivity(...args: unknown[]): unknown {
  throw new Error("not implemented: recordChannelActivity");
}
export function getChannelActivity(...args: unknown[]): unknown {
  throw new Error("not implemented: getChannelActivity");
}
export function resetChannelActivityForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: resetChannelActivityForTest");
}
