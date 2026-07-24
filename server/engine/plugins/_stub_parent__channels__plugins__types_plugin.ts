// === MIGRATED FROM OPENCLAW SOURCE (simplified) ===
// Source: openclaw/src/channels/plugins/types.plugin.ts
// Status: 已移植 openclaw 同源类型定义（简化版，省略完整 adapter 依赖链）
// Used by: server/engine/plugins/{channel-validation,loader-channel-setup}.ts
// 注：openclaw ChannelPlugin 是大型 channel 插件接口，依赖 30+ adapter 类型
//      (types.adapters.ts / types.core.ts)。本简化版保留核心字段类型
//      (meta/commands/configSchema)，其余 adapter 字段保留为 Record<string, unknown>。

import type { ChannelConfigSchema } from "./_stub_parent__channels__plugins__types_config.js";
import type { ChannelMeta } from "./_stub_parent__channels__plugins__types_public.js";

/** Native command/skill auto-enable defaults exposed by channel manifests. */
export type ChannelCommandDefaults = {
  nativeCommandsAutoEnabled?: boolean;
  nativeSkillsAutoEnabled?: boolean;
};

/** Channel command adapter surface (simplified). */
export type ChannelCommandAdapter = ChannelCommandDefaults & {
  [key: string]: unknown;
};

/** Simplified channel plugin contract. */
export interface ChannelPlugin {
  id: string;
  meta?: ChannelMeta;
  capabilities?: Record<string, unknown>;
  defaults?: {
    queue?: {
      debounceMs?: number;
    };
  };
  reload?: { configPrefixes: string[]; noopPrefixes?: string[] };
  configSchema?: ChannelConfigSchema;
  config?: {
    listAccountIds?: () => unknown;
    resolveAccount?: (...args: unknown[]) => unknown;
    [key: string]: unknown;
  };
  setup?: Record<string, unknown>;
  pairing?: Record<string, unknown>;
  security?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  mentions?: Record<string, unknown>;
  outbound?: Record<string, unknown>;
  status?: Record<string, unknown>;
  gateway?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  elevated?: Record<string, unknown>;
  commands?: ChannelCommandAdapter;
  lifecycle?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  allowlist?: Record<string, unknown>;
  doctor?: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  conversationBindings?: Record<string, unknown>;
  streaming?: Record<string, unknown>;
  threading?: Record<string, unknown>;
  message?: Record<string, unknown>;
  messaging?: Record<string, unknown>;
  agentPrompt?: Record<string, unknown>;
  directory?: Record<string, unknown>;
  resolver?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  heartbeat?: Record<string, unknown>;
  agentTools?: unknown;
  [key: string]: unknown;
}
