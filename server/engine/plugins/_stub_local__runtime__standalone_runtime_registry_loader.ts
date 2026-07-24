// === PENDING MIGRATION STUB ===
// Source: openclaw/src/runtime/standalone-runtime-registry-loader.ts (待迁移)
// Status: 类型安全 no-op 实现 — 返回 undefined
// Used by: server/engine/plugins/{migration-provider-runtime,memory-runtime,tools}.ts
// 注：openclaw 同源实现加载独立运行时的插件注册表

export const ensureStandaloneRuntimePluginRegistryLoaded = (_params?: {
  surface?: string;
  forceLoad?: boolean;
  installRegistry?: boolean;
  requiredPluginIds?: readonly string[];
  loadOptions?: unknown;
  [key: string]: unknown;
}): undefined => undefined;
