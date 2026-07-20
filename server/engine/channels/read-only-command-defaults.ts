// 移植自 openclaw/src/channels/plugins/read-only-command-defaults.ts
// 降级：channel plugin 依赖简化

export type ChannelCommandDefaults = {
  provider: string;
  commands?: Record<string, { defaultValue?: string; readOnly?: boolean }>;
  [key: string]: unknown;
};

const SAFE_CHANNEL_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

/** Checks if a channel id is a safe manifest channel id. */
export function isSafeManifestChannelId(channelId: string): boolean {
  return SAFE_CHANNEL_ID_PATTERN.test(channelId?.trim().toLowerCase());
}

/** Reads a value from a record with string key normalization. */
export function readOwnRecordValue(record: Record<string, unknown>, key: string): unknown {
  return record[key] ?? record[key.toLowerCase()] ?? undefined;
}

/** Normalizes channel command defaults. */
export function normalizeChannelCommandDefaults(defaults: Partial<ChannelCommandDefaults>): ChannelCommandDefaults {
  return {
    provider: defaults.provider?.trim() || "",
    commands: defaults.commands ?? {},
  };
}

/** Resolves read-only channel command defaults. */
export function resolveReadOnlyChannelCommandDefaults(params: {
  provider: string;
  cfg?: unknown;
}): ChannelCommandDefaults {
  return { provider: params.provider?.trim() || "", commands: {} };
}
