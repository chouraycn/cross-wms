// 移植自 openclaw/src/channels/plugins/dm-access.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelDmAllowFromMode = unknown;

export type ChannelDmPolicy = unknown;

export type ChannelDmAccess = unknown;

export type DmAccessRecord = unknown;

export type CompatMutationResult = unknown;

export function normalizeChannelDmPolicy(..._args: unknown[]): unknown {
  throw new Error("not implemented: normalizeChannelDmPolicy");
}

export function resolveChannelDmPolicy(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelDmPolicy");
}

export function resolveChannelDmAllowFrom(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelDmAllowFrom");
}

export function resolveChannelDmAccess(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelDmAccess");
}

export function setCanonicalDmAllowFrom(..._args: unknown[]): unknown {
  throw new Error("not implemented: setCanonicalDmAllowFrom");
}

export function normalizeLegacyDmAliases(..._args: unknown[]): unknown {
  throw new Error("not implemented: normalizeLegacyDmAliases");
}

export function ensureOpenDmPolicyAllowFromWildcard(..._args: unknown[]): unknown {
  throw new Error("not implemented: ensureOpenDmPolicyAllowFromWildcard");
}
