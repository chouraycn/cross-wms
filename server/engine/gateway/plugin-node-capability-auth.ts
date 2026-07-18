// 移植自 openclaw/src/gateway/server/plugin-node-capability-auth.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function authorizePluginNodeCapabilityRequest(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: authorizePluginNodeCapabilityRequest");
}
