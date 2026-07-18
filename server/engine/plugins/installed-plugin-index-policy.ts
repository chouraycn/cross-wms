// Applies policy checks to installed plugin index records.
//
// 移植自 openclaw/src/plugins/installed-plugin-index-policy.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/types.js 的 OpenClawConfig。cross-wms 尚未移植完整配置
//    类型层级。这里定义本地宽松结构占位，仅含 plugins/channels 字段。
//  - 原文件依赖 ./compat/registry.js 的 listPluginCompatRecords。cross-wms 尚未
//    移植该模块。这里内联降级实现：返回空数组，使 resolveCompatRegistryVersion
//    始终返回空数组的哈希值。
//  - 原文件依赖 ./config-state.js 的 normalizePluginsConfig。cross-wms 尚未移植
//    该模块。这里内联降级实现：返回空规范化结构。
//  - 原文件依赖 ./installed-plugin-index-hash.js 的 hashJson。cross-wms 已移植，
//    直接引用。

import { hashJson } from "./installed-plugin-index-hash.js";

// ============================================================================
// 内联降级类型占位：../config/types.js —— OpenClawConfig
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足 installed-plugin-index-policy 对 config 字段的访问。
 */
type OpenClawConfig = {
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>;
    [key: string]: unknown;
  };
  channels?: Record<string, unknown>;
  [key: string]: unknown;
};

// ============================================================================
// 内联降级：./compat/registry.js —— listPluginCompatRecords
// ============================================================================

/**
 * 插件兼容性记录（降级占位）。
 *
 * 降级说明：cross-wms 的 compat/registry.js 尚未移植。这里定义与
 * openclaw PluginCompatRecord 结构兼容的最小类型，仅含
 * resolveCompatRegistryVersion 实际访问的字段。
 */
type PluginCompatRecord = {
  code: string;
  status: string;
  deprecated?: boolean;
  warningStarts?: string;
  removeAfter?: string;
  replacement?: string;
};

/**
 * 列出插件兼容性记录。
 *
 * 降级说明：cross-wms 的 compat/registry.js 尚未移植。这里降级为
 * 始终返回空数组，使 resolveCompatRegistryVersion 返回空数组的哈希值。
 */
function listPluginCompatRecords(): PluginCompatRecord[] {
  return [];
}

// ============================================================================
// 内联降级：./config-state.js —— normalizePluginsConfig
// ============================================================================

/**
 * 规范化后的插件配置（降级占位）。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。这里定义与
 * openclaw NormalizedPluginsConfig 结构兼容的最小类型。
 */
type NormalizedPluginsConfig = {
  enabled: readonly string[];
  allow: readonly string[];
  deny: readonly string[];
  slots: Record<string, unknown>;
  entries: Record<string, { enabled?: boolean }>;
};

/**
 * 规范化插件配置。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。这里降级为
 * 从 config.plugins 中提取 entries 的 enabled 状态，其余字段返回空。
 */
function normalizePluginsConfig(plugins: unknown): NormalizedPluginsConfig {
  const entries: Record<string, { enabled?: boolean }> = {};
  if (plugins && typeof plugins === "object" && !Array.isArray(plugins)) {
    const rawEntries = (plugins as { entries?: Record<string, unknown> }).entries;
    if (rawEntries && typeof rawEntries === "object" && !Array.isArray(rawEntries)) {
      for (const [pluginId, entry] of Object.entries(rawEntries)) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const enabled = (entry as { enabled?: unknown }).enabled;
          if (typeof enabled === "boolean") {
            entries[pluginId] = { enabled };
          }
        }
      }
    }
  }
  return {
    enabled: [],
    allow: [],
    deny: [],
    slots: {},
    entries,
  };
}

// ============================================================================
// installed-plugin-index-policy 实现
// ============================================================================

/** Hashes plugin compat registry state that can affect installed index validity. */
export function resolveCompatRegistryVersion(): string {
  return hashJson(
    listPluginCompatRecords().map((record) => ({
      code: record.code,
      status: record.status,
      deprecated: record.deprecated,
      warningStarts: record.warningStarts,
      removeAfter: record.removeAfter,
      replacement: record.replacement,
    })),
  );
}

/** Hashes config policy inputs that can change installed plugin activation. */
export function resolveInstalledPluginIndexPolicyHash(config: OpenClawConfig | undefined): string {
  const normalized = normalizePluginsConfig(config?.plugins);
  const channelPolicy: Record<string, boolean> = {};
  const channels = config?.channels;
  if (channels && typeof channels === "object" && !Array.isArray(channels)) {
    for (const [channelId, value] of Object.entries(channels)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const enabled = (value as Record<string, unknown>).enabled;
        if (typeof enabled === "boolean") {
          channelPolicy[channelId] = enabled;
        }
      }
    }
  }
  return hashJson({
    plugins: {
      enabled: normalized.enabled,
      allow: normalized.allow,
      deny: normalized.deny,
      slots: normalized.slots,
      entries: Object.fromEntries(
        Object.entries(normalized.entries)
          .flatMap(([pluginId, entry]) =>
            typeof entry.enabled === "boolean" ? [[pluginId, entry.enabled] as const] : [],
          )
          .toSorted(([left], [right]) => left.localeCompare(right)),
      ),
    },
    channels: Object.fromEntries(
      Object.entries(channelPolicy).toSorted(([left], [right]) => left.localeCompare(right)),
    ),
  });
}
