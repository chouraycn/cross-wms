/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/mcp-http.request.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export function validateMcpLoopbackRequest(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] validateMcpLoopbackRequest not implemented");
}

export async function readMcpHttpBody(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readMcpHttpBody not implemented");
}

export function isMcpHttpBodyTooLargeError(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isMcpHttpBodyTooLargeError not implemented");
}

export function isMcpHttpBodyTimeoutError(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isMcpHttpBodyTimeoutError not implemented");
}

export function resolveMcpHttpBodyTimeoutMs(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveMcpHttpBodyTimeoutMs not implemented");
}

export function resolveMcpCliCaptureKey(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveMcpCliCaptureKey not implemented");
}

export function resolveMcpRequestContext(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveMcpRequestContext not implemented");
}
