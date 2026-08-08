// === MIGRATED FROM OPENCLAW SOURCE (simplified) ===
// Source: openclaw/src/channels/plugins/types.plugin.ts
// Status: 已移植 openclaw 同源类型定义（简化版，省略完整 adapter 依赖链）
// Used by: server/engine/plugins/{channel-validation,loader-channel-setup}.ts
// 注：openclaw ChannelPlugin 是大型 channel 插件接口，依赖 30+ adapter 类型
//      (types.adapters.ts / types.core.ts)。本简化版保留核心字段类型
//      (meta/commands/configSchema)，其余 adapter 字段保留为 Record<string, any>。

import type { ChannelConfigSchema } from "./_stub_parent__channels__plugins__types_config.js";
import type { ChannelMeta } from "./_stub_parent__channels__plugins__types_public.js";

/** Native command/skill auto-enable defaults exposed by channel manifests. */
export type ChannelCommandDefaults = {
  nativeCommandsAutoEnabled?: boolean;
  nativeSkillsAutoEnabled?: boolean;
};

/** Channel command adapter surface (simplified). */
export type ChannelCommandAdapter = ChannelCommandDefaults & {
  [key: string]: any;
};

/** Simplified channel plugin contract. */
export interface ChannelPlugin {
  id: string;
  meta?: ChannelMeta;
  capabilities?: Record<string, any>;
  defaults?: {
    queue?: {
      debounceMs?: number;
    };
  };
  reload?: { configPrefixes: string[]; noopPrefixes?: string[] };
  configSchema?: ChannelConfigSchema;
  config?: {
    listAccountIds?: () => unknown;
    resolveAccount?: (...args: any[]) => unknown;
    [key: string]: any;
  };
  setup?: Record<string, any>;
  pairing?: Record<string, any>;
  security?: Record<string, any>;
  groups?: Record<string, any>;
  mentions?: Record<string, any>;
  outbound?: Record<string, any>;
  status?: Record<string, any>;
  gateway?: Record<string, any>;
  auth?: Record<string, any>;
  elevated?: Record<string, any>;
  commands?: ChannelCommandAdapter;
  lifecycle?: Record<string, any>;
  secrets?: Record<string, any>;
  allowlist?: Record<string, any>;
  doctor?: Record<string, any>;
  bindings?: Record<string, any>;
  conversationBindings?: Record<string, any>;
  streaming?: Record<string, any>;
  threading?: Record<string, any>;
  message?: Record<string, any>;
  messaging?: Record<string, any>;
  agentPrompt?: Record<string, any>;
  directory?: Record<string, any>;
  resolver?: Record<string, any>;
  actions?: Record<string, any>;
  heartbeat?: Record<string, any>;
  agentTools?: any;
  [key: string]: any;
}
