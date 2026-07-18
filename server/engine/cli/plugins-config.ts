// 插件配置变更的公共 CLI barrel。
// 移植自 openclaw/src/cli/plugins-config.ts。
//
// 降级策略：
//  - 原模块从 `../plugins/toggle-config.js` 重新导出 `setPluginEnabledInConfig`。
//    cross-wms 未移植 `plugins/toggle-config.js`，这里提供降级实现，
//    直接操作 OpenClawConfig 的 plugins.entries 字段，行为与 openclaw 一致。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

type PluginEntry = {
  enabled?: boolean;
};

type PluginsSection = {
  entries?: Record<string, PluginEntry>;
};

type ConfigWithPlugins = OpenClawConfig & {
  plugins?: PluginsSection;
};

/**
 * 在 OpenClaw config 中切换插件的启用状态。
 *
 * 降级实现：openclaw 的 `plugins/toggle-config.js` 未移植。
 * 这里直接操作 `config.plugins.entries[pluginId].enabled` 字段，
 * 保留原 openclaw 函数签名与返回值契约。
 */
export function setPluginEnabledInConfig(
  config: OpenClawConfig,
  pluginId: string,
  enabled: boolean,
  _options: { updateChannelConfig?: boolean } = {},
): OpenClawConfig {
  const cfg = config as ConfigWithPlugins;
  const plugins = cfg.plugins ?? {};
  const entries = plugins.entries ?? {};
  const existing = entries[pluginId] ?? {};
  return {
    ...cfg,
    plugins: {
      ...plugins,
      entries: {
        ...entries,
        [pluginId]: {
          ...existing,
          enabled,
        },
      },
    },
  } as OpenClawConfig;
}
