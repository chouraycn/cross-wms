// 移植自 openclaw/src/gateway/server/plugins-http/route-capability.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginNodeCapabilityRoute = unknown;

export function findMatchingPluginNodeCapabilityRoutes(...args: unknown[]): unknown {
  throw new Error("not implemented: findMatchingPluginNodeCapabilityRoutes");
}

export function findMatchingPluginNodeCapabilityRoute(...args: unknown[]): unknown {
  throw new Error("not implemented: findMatchingPluginNodeCapabilityRoute");
}

export function listPluginNodeCapabilities(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginNodeCapabilities");
}
