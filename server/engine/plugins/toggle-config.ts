// Toggles plugin enablement config for channels and agents.
//
// 移植自 openclaw/src/plugins/toggle-config.ts。
//
// 降级策略：
//  - 原文件依赖 ../channels/ids.js 的 normalizeChatChannelId。cross-wms 尚未
//    移植该模块。这里内联降级实现：返回 undefined（无内置通道映射），使
//    setPluginEnabledInConfig 仅更新 plugins.entries 而不同步 channels 配置。
//  - 原文件依赖 ../config/types.openclaw.js 的 OpenClawConfig。cross-wms 尚未
//    移植完整配置类型层级。这里定义本地宽松结构占位，仅含 plugins/channels 字段。

// ============================================================================
// 内联降级类型占位：../config/types.openclaw.js —— OpenClawConfig
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足 toggle-config 对 plugins/channels 字段的访问。
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
// 内联降级：../channels/ids.js —— normalizeChatChannelId
// ============================================================================

/**
 * 规范化聊天通道 ID。
 *
 * 降级说明：cross-wms 的 channels/ids.js 尚未移植。openclaw 原版将内置通道
 * 插件 ID（如 "claude-code"）映射到通道 ID（如 "claude"）。这里降级为
 * 始终返回 undefined，表示无内置通道映射，setPluginEnabledInConfig 将仅
 * 更新 plugins.entries 而不同步 channels 配置。
 */
function normalizeChatChannelId(_pluginId: string): string | undefined {
  return undefined;
}

/** Returns config with a plugin enabled/disabled and optional built-in channel state synced. */
export function setPluginEnabledInConfig(
  config: OpenClawConfig,
  pluginId: string,
  enabled: boolean,
  options: { updateChannelConfig?: boolean } = {},
): OpenClawConfig {
  const builtInChannelId = normalizeChatChannelId(pluginId);
  const resolvedId = builtInChannelId ?? pluginId;

  const next: OpenClawConfig = {
    ...config,
    plugins: {
      ...config.plugins,
      entries: {
        ...config.plugins?.entries,
        [resolvedId]: {
          ...(config.plugins?.entries?.[resolvedId] as object | undefined),
          enabled,
        },
      },
    },
  };

  if (!builtInChannelId || options.updateChannelConfig === false) {
    return next;
  }

  const channels = config.channels as Record<string, unknown> | undefined;
  const existing = channels?.[builtInChannelId];
  const existingRecord =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  return {
    ...next,
    channels: {
      ...config.channels,
      [builtInChannelId]: {
        ...existingRecord,
        enabled,
      },
    },
  };
}
