/**
 * Shares plugin config normalization helpers across control-plane paths.
 * 移植自 openclaw/src/plugins/config-normalization-shared.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type NormalizedPluginsConfig = unknown;

export type NormalizePluginId = unknown;

export const identityNormalizePluginId: (id: string) => string = (id) => id.trim();

export function normalizePluginsConfigWithResolver(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizePluginsConfigWithResolver");
}

export function hasExplicitPluginConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: hasExplicitPluginConfig");
}

export function isBundledChannelEnabledByChannelConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: isBundledChannelEnabledByChannelConfig");
}

