// 移植自 openclaw/src/channels/plugins/outbound/interactive.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const adaptMessagePresentationForChannel: unknown = undefined;

export const applyPresentationActionLimits: unknown = undefined;

export const presentationPageSize: unknown = undefined;

export function reduceInteractiveReply(..._args: unknown[]): unknown {
  throw new Error("not implemented: reduceInteractiveReply");
}
