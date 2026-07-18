/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/server-plugins.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type GatewayMethodDispatchResponse = unknown;

export function setFallbackGatewayContext(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] setFallbackGatewayContext not implemented");
}

export function setFallbackGatewayContextResolver(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] setFallbackGatewayContextResolver not implemented");
}

export function clearFallbackGatewayContext(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] clearFallbackGatewayContext not implemented");
}

export function hasInProcessGatewayContext(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] hasInProcessGatewayContext not implemented");
}

export function setPluginSubagentOverridePolicies(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] setPluginSubagentOverridePolicies not implemented");
}

export async function dispatchGatewayMethodInProcessRaw(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] dispatchGatewayMethodInProcessRaw not implemented");
}

export async function dispatchGatewayMethodInProcess(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] dispatchGatewayMethodInProcess not implemented");
}

export function createGatewaySubagentRuntime(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createGatewaySubagentRuntime not implemented");
}

export function createGatewayNodesRuntime(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createGatewayNodesRuntime not implemented");
}

export function loadGatewayPlugins(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] loadGatewayPlugins not implemented");
}
