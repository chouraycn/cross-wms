// 移植自 openclaw/src/plugins/gateway-bindings.ts

export function setGatewaySubagentRuntime(...args: unknown[]): unknown {
  return undefined;
}
export function setGatewayNodesRuntime(...args: unknown[]): unknown {
  return undefined;
}
export function clearGatewaySubagentRuntime(...args: unknown[]): unknown {
  return undefined;
}
export const gatewaySubagentState: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
