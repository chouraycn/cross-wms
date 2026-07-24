// === MIGRATED FROM OPENCLAW SOURCE (simplified) ===
// Source: openclaw/src/channels/plugins/read-only-command-defaults.ts
// Status: 已移植类型定义；resolveReadOnlyChannelCommandDefaults 保留简化 no-op
// Used by: server/engine/plugins/command-specs.ts
// 注：openclaw 同源实现从已安装插件 manifest 读取 native command 默认配置，
//      依赖 resolvePluginMetadataSnapshot / isInstalledPluginEnabled /
//      PluginManifestRecord 等重依赖链。本简化版导出 ChannelCommandDefaults
//      类型并返回 undefined（无默认配置），与 openclaw "未找到配置时返回
//      undefined" 语义一致。

import type { ChannelCommandDefaults } from "./_stub_parent__channels__plugins__types_plugin.js";

export type { ChannelCommandDefaults };

export const resolveReadOnlyChannelCommandDefaults = (
  _channelId: string,
  _options?: {
    config?: unknown;
    env?: NodeJS.ProcessEnv;
    stateDir?: string;
    workspaceDir?: string;
  },
): ChannelCommandDefaults | undefined => undefined;
