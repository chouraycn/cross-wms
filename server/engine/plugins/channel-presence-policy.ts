/**
 * Resolves channel presence policy advertised by plugin metadata.
 * 移植自 openclaw/src/plugins/channel-presence-policy.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type ConfiguredChannelPresenceSource = unknown;

export type ConfiguredChannelBlockedReason = unknown;

export type ConfiguredChannelPresencePolicyEntry = unknown;

export function hasExplicitChannelConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: hasExplicitChannelConfig");
}

export function listExplicitConfiguredChannelIdsForConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: listExplicitConfiguredChannelIdsForConfig");
}

export function resolveConfiguredChannelPresencePolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredChannelPresencePolicy");
}

export function listConfiguredChannelIdsForReadOnlyScope(...args: unknown[]): unknown {
  throw new Error("not implemented: listConfiguredChannelIdsForReadOnlyScope");
}

export function hasConfiguredChannelsForReadOnlyScope(...args: unknown[]): unknown {
  throw new Error("not implemented: hasConfiguredChannelsForReadOnlyScope");
}

export function listConfiguredAnnounceChannelIdsForConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: listConfiguredAnnounceChannelIdsForConfig");
}

export function resolveDiscoverableScopedChannelPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDiscoverableScopedChannelPluginIds");
}

export function resolveConfiguredChannelPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredChannelPluginIds");
}

