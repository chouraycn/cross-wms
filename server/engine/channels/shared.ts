// 移植自 openclaw/src/channels/plugins/status-issues/shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const isRecord: unknown = undefined;

export function asString(..._args: unknown[]): unknown {
  throw new Error("not implemented: asString");
}

export function formatMatchMetadata(..._args: unknown[]): unknown {
  throw new Error("not implemented: formatMatchMetadata");
}

export function appendMatchMetadata(..._args: unknown[]): unknown {
  throw new Error("not implemented: appendMatchMetadata");
}

export function resolveEnabledConfiguredAccountId(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveEnabledConfiguredAccountId");
}
