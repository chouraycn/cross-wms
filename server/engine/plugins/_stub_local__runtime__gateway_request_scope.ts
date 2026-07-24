// === PENDING MIGRATION STUB ===
// Source: openclaw/src/runtime/gateway-request-scope.ts (待迁移)
// Status: 类型安全 no-op 实现 — 直接执行回调不绑定作用域
// Used by: server/engine/plugins/tools.ts
// 注：openclaw 同源实现需要绑定 gateway 请求作用域，cross-wms 当前未启用

export const withPluginRuntimePluginScope = <T>(_scope: unknown, fn: () => T): T => fn();
