// 移植自 openclaw/src/channels/plugins/read-only-command-defaults.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelCommandDefaults = unknown;

export function isSafeManifestChannelId(..._args: unknown[]): unknown {
  throw new Error("not implemented: isSafeManifestChannelId");
}

export function readOwnRecordValue(..._args: unknown[]): unknown {
  throw new Error("not implemented: readOwnRecordValue");
}

export function normalizeChannelCommandDefaults(..._args: unknown[]): unknown {
  throw new Error("not implemented: normalizeChannelCommandDefaults");
}

export function resolveReadOnlyChannelCommandDefaults(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveReadOnlyChannelCommandDefaults");
}
