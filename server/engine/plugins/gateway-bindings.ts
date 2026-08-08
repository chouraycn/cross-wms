// 移植自 openclaw/src/plugins/gateway-bindings.ts

export function setGatewaySubagentRuntime(...args: any[]): any {
  return undefined;
}
export function setGatewayNodesRuntime(...args: any[]): any {
  return undefined;
}
export function clearGatewaySubagentRuntime(...args: any[]): any {
  return undefined;
}
export const gatewaySubagentState: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
