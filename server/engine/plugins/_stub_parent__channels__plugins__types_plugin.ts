// === PENDING MIGRATION STUB ===
// Source: openclaw/src/channels/plugins/types.plugin.ts (待迁移)
// Status: 结构化类型占位 stub — 类型为 ChannelPlugin 接口
// Used by: server/engine/plugins/{channel-validation,loader-channel-setup}.ts
// 注：openclaw ChannelPlugin 是大型 channel 插件接口

export interface ChannelPlugin {
  id: string;
  label?: string;
  description?: string;
  configSchema?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  commands?: Record<string, unknown>;
  doctor?: Record<string, unknown>;
  reload?: Record<string, unknown>;
  config?: Record<string, unknown>;
  setup?: Record<string, unknown>;
  messaging?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  [key: string]: unknown;
}
