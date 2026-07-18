// 移植自 openclaw/src/config/channel-compat-normalization.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type LegacyStreamingAliasOptions = unknown;
export type NormalizeLegacyChannelAccountParams = unknown;
export function asObjectRecord(...args: unknown[]): unknown {
  throw new Error("not implemented: asObjectRecord");
}
export function hasLegacyAccountStreamingAliases(...args: unknown[]): unknown {
  throw new Error("not implemented: hasLegacyAccountStreamingAliases");
}
export function normalizeLegacyStreamingAliases(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeLegacyStreamingAliases");
}
export function normalizeLegacyChannelAliases(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeLegacyChannelAliases");
}
export function hasLegacyStreamingAliases(...args: unknown[]): unknown {
  throw new Error("not implemented: hasLegacyStreamingAliases");
}
export type normalizeLegacyDmAliases = unknown;
export type CompatMutationResult = unknown;
