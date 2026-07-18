// 在清单记录到达控制面决策前，应用工作区插件 allow/deny 配置。
//
// 降级说明：
// - 原 openclaw 版本依赖 `@openclaw/normalization-core/string-coerce` 的
//   `normalizeOptionalLowercaseString`，这里改为本地实现。
// - 原 `OpenClawConfig` 与 `PluginManifestRecord` 类型来自未移植模块，这里用本地占位类型替代。

/**
 * 将可选字符串规范化为小写形式；非字符串或空值返回 undefined。
 * 本地降级实现，替代 `@openclaw/normalization-core/string-coerce` 的 `normalizeOptionalLowercaseString`。
 */
function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

/**
 * 降级占位类型，替代 `../config/types.openclaw.js` 的 `OpenClawConfig`。
 * 仅保留本模块实际访问的 plugins 子结构。
 */
type OpenClawConfig = {
  plugins?: {
    enabled?: boolean;
    allow?: unknown[];
    deny?: unknown[];
    entries?: Record<string, unknown>;
  };
};

/**
 * 降级占位类型，替代 `./manifest-registry.js` 的 `PluginManifestRecord`。
 * 仅保留本模块实际访问的 id 字段。
 */
type PluginManifestRecord = {
  id: string;
};

type PluginEntriesConfig = NonNullable<NonNullable<OpenClawConfig["plugins"]>["entries"]>;

/** 规范化用于配置 allow/deny/entry 列表的插件 id。 */
export function normalizePluginConfigId(id: unknown): string {
  return normalizeOptionalLowercaseString(id) ?? "";
}

function hasPluginConfigId(list: unknown, pluginId: string): boolean {
  return Array.isArray(list) && list.some((entry) => normalizePluginConfigId(entry) === pluginId);
}

function findPluginConfigEntry(
  entries: PluginEntriesConfig | undefined,
  pluginId: string,
): { enabled?: boolean } | undefined {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return undefined;
  }
  for (const [key, value] of Object.entries(entries)) {
    if (normalizePluginConfigId(key) !== pluginId) {
      continue;
    }
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as { enabled?: boolean })
      : {};
  }
  return undefined;
}

/** 解析工作区插件配置是否允许某条插件清单记录。 */
export function isWorkspacePluginAllowedByConfig(params: {
  config: OpenClawConfig | undefined;
  isImplicitlyAllowed?: (pluginId: string) => boolean;
  plugin: PluginManifestRecord;
}): boolean {
  const pluginsConfig = params.config?.plugins;
  if (pluginsConfig?.enabled === false) {
    return false;
  }

  const pluginId = normalizePluginConfigId(params.plugin.id);
  if (!pluginId || hasPluginConfigId(pluginsConfig?.deny, pluginId)) {
    return false;
  }

  const entry = findPluginConfigEntry(pluginsConfig?.entries, pluginId);
  if (entry?.enabled === false) {
    return false;
  }
  if (entry?.enabled === true || hasPluginConfigId(pluginsConfig?.allow, pluginId)) {
    return true;
  }
  return params.isImplicitlyAllowed?.(pluginId) ?? false;
}
