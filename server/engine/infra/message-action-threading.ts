// 移植自 openclaw/src/infra/message-action-threading.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveAndApplyOutboundThreadId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAndApplyOutboundThreadId");
}
export function resolveAndApplyOutboundReplyToId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAndApplyOutboundReplyToId");
}
export function prepareOutboundMirrorRoute(...args: unknown[]): unknown {
  throw new Error("not implemented: prepareOutboundMirrorRoute");
}
