// 移植自 openclaw/src/config/group-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelGroupPolicy = unknown;
export function resolveToolsBySender(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveToolsBySender");
}
export function resolveChannelGroupPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelGroupPolicy");
}
export function resolveChannelGroupRequireMention(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelGroupRequireMention");
}
export function resolveChannelGroupToolsPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelGroupToolsPolicy");
}
