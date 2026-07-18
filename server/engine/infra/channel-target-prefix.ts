// 移植自 openclaw/src/infra/channel-target-prefix.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelTargetProviderPrefix = unknown;
export function stripTargetProviderPrefix(...args: unknown[]): unknown {
  throw new Error("not implemented: stripTargetProviderPrefix");
}
export function stripTargetKindPrefix(...args: unknown[]): unknown {
  throw new Error("not implemented: stripTargetKindPrefix");
}
export function stripTargetTopicSuffix(...args: unknown[]): unknown {
  throw new Error("not implemented: stripTargetTopicSuffix");
}
export function resolveTargetPrefixedChannel(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveTargetPrefixedChannel");
}
export function validateTargetProviderPrefix(...args: unknown[]): unknown {
  throw new Error("not implemented: validateTargetProviderPrefix");
}
