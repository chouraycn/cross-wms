// 移植自 openclaw/src/channels/allowlists/resolve-utils.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type AllowlistUserResolutionLike = unknown;

export function mergeAllowlist(..._args: unknown[]): unknown {
  throw new Error("not implemented: mergeAllowlist");
}

export function buildAllowlistResolutionSummary(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildAllowlistResolutionSummary");
}

export function canonicalizeAllowlistWithResolvedIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: canonicalizeAllowlistWithResolvedIds");
}

export function patchAllowlistUsersInConfigEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: patchAllowlistUsersInConfigEntries");
}

export function addAllowlistUserEntriesFromConfigEntry(..._args: unknown[]): unknown {
  throw new Error("not implemented: addAllowlistUserEntriesFromConfigEntry");
}

export function summarizeMapping(..._args: unknown[]): unknown {
  throw new Error("not implemented: summarizeMapping");
}
