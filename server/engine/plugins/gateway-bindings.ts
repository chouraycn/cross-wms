// 移植自 openclaw/src/plugins/gateway-bindings.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function setGatewaySubagentRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: setGatewaySubagentRuntime");
}
export function setGatewayNodesRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: setGatewayNodesRuntime");
}
export function clearGatewaySubagentRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: clearGatewaySubagentRuntime");
}
export const gatewaySubagentState: unknown = undefined;
