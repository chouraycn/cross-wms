/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/mcp-http.protocol.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type JsonRpcRequest = unknown;

export function jsonRpcResult(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] jsonRpcResult not implemented");
}

export function jsonRpcError(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] jsonRpcError not implemented");
}

export const MCP_LOOPBACK_SERVER_NAME: any = undefined;

export const MCP_LOOPBACK_SERVER_VERSION: any = undefined;

export const MCP_LOOPBACK_SUPPORTED_PROTOCOL_VERSIONS: any = undefined;
