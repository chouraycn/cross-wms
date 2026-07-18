// 移植自 openclaw/src/channels/plugins/target-parsing-loaded.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelRouteParsedTarget = unknown;

export type ParsedChannelExplicitTarget = unknown;

export function resolveCompatParsedRouteTarget(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveCompatParsedRouteTarget");
}

export type ComparableChannelTarget = unknown;

export function parseExplicitTargetForLoadedChannel(..._args: unknown[]): unknown {
  throw new Error("not implemented: parseExplicitTargetForLoadedChannel");
}

export function resolveRouteTargetForLoadedChannel(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveRouteTargetForLoadedChannel");
}

export function resolveExplicitDeliveryTargetCompat(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveExplicitDeliveryTargetCompat");
}

export function resolveComparableTargetForLoadedChannel(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveComparableTargetForLoadedChannel");
}

export function comparableChannelTargetsMatch(..._args: unknown[]): unknown {
  throw new Error("not implemented: comparableChannelTargetsMatch");
}

export function comparableChannelTargetsShareRoute(..._args: unknown[]): unknown {
  throw new Error("not implemented: comparableChannelTargetsShareRoute");
}
