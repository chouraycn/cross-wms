/**
 * * Provides plugin CLI node APIs by forwarding calls to the Gateway.
 * 移植自 openclaw/src/plugins/cli-gateway-nodes-runtime.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolvePluginCliNodeInvokeGatewayTimeoutMs(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginCliNodeInvokeGatewayTimeoutMs");
}

export function createPluginCliGatewayNodesRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: createPluginCliGatewayNodesRuntime");
}

