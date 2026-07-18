/**
 * 移植自 openclaw/src/agents/tools/gateway.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type GatewayCallOptions = unknown;
export function readGatewayCallOptions(..._args: unknown[]): unknown {
  throw new Error("readGatewayCallOptions not implemented (openclaw stub)");
}
export function resolveGatewayOptions(..._args: unknown[]): unknown {
  throw new Error("resolveGatewayOptions not implemented (openclaw stub)");
}
export function callGatewayTool(..._args: unknown[]): unknown {
  throw new Error("callGatewayTool not implemented (openclaw stub)");
}
