// === PENDING MIGRATION STUB ===
// Source: openclaw/src/runtime/types.ts (待迁移)
// Status: 结构化类型占位 stub — 类型为 PluginRuntime 接口
// Used by: server/engine/plugins/{setup-registry,cli-gateway-nodes-runtime,api-builder,loader-channel-setup,captured-registration}.ts
// 注：openclaw 同源 PluginRuntime 类型是大型联合类型

export interface PluginRuntime {
  id: string;
  name?: string;
  version?: string;
  nodes?: { [key: string]: unknown };
  [key: string]: unknown;
}
