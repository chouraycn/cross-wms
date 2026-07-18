/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/mcp-http.loopback-runtime.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type McpLoopbackToolCallResult = unknown;

export type McpLoopbackToolCallStart = unknown;

export type McpLoopbackRequestCaptureHandle = unknown;

export type McpLoopbackToolCallCaptureHandle = unknown;

export function beginMcpLoopbackToolCallCapture(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] beginMcpLoopbackToolCallCapture not implemented");
}

export function resolveMcpLoopbackYieldContext(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveMcpLoopbackYieldContext not implemented");
}

export function markMcpLoopbackRequestStarted(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] markMcpLoopbackRequestStarted not implemented");
}

export function markMcpLoopbackRequestClassified(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] markMcpLoopbackRequestClassified not implemented");
}

export function markMcpLoopbackRequestFinished(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] markMcpLoopbackRequestFinished not implemented");
}

export function markMcpLoopbackToolCallStarted(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] markMcpLoopbackToolCallStarted not implemented");
}

export function updateMcpLoopbackToolCallCapture(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] updateMcpLoopbackToolCallCapture not implemented");
}

export function recordMcpLoopbackToolCallResult(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] recordMcpLoopbackToolCallResult not implemented");
}

export function markMcpLoopbackToolCallFinished(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] markMcpLoopbackToolCallFinished not implemented");
}

export async function waitForMcpLoopbackToolCallCaptureIdle(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] waitForMcpLoopbackToolCallCaptureIdle not implemented");
}

export function clearMcpLoopbackToolCallCapture(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] clearMcpLoopbackToolCallCapture not implemented");
}

export function clearMcpLoopbackToolCallCapturesForTest(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] clearMcpLoopbackToolCallCapturesForTest not implemented");
}

export function getActiveMcpLoopbackRuntime(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getActiveMcpLoopbackRuntime not implemented");
}

export function setActiveMcpLoopbackRuntime(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] setActiveMcpLoopbackRuntime not implemented");
}

export function resolveMcpLoopbackBearerToken(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveMcpLoopbackBearerToken not implemented");
}

export function clearActiveMcpLoopbackRuntimeByOwnerToken(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] clearActiveMcpLoopbackRuntimeByOwnerToken not implemented");
}

export function createMcpLoopbackServerConfig(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createMcpLoopbackServerConfig not implemented");
}
