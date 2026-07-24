// === PENDING MIGRATION STUB ===
// Source: openclaw/src/channels/plugins/read-only-command-defaults.ts (待迁移)
// Status: 类型安全 no-op 实现 — 返回空对象
// Used by: server/engine/plugins/command-specs.ts
// 注：openclaw 同源实现为只读 channel command 提供默认配置

export const resolveReadOnlyChannelCommandDefaults = (
  _providerName: string,
  _options?: { config?: unknown; [key: string]: unknown },
): Record<string, unknown> => ({});
