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
  return undefined;
}

export function setFallbackGatewayContextResolver(..._args: unknown[]): any {
  return undefined;
}

export function clearFallbackGatewayContext(..._args: unknown[]): any {
  return undefined;
}

export function hasInProcessGatewayContext(..._args: unknown[]): any {
  return false;
}

export function setPluginSubagentOverridePolicies(..._args: unknown[]): any {
  return undefined;
}

export async function dispatchGatewayMethodInProcessRaw(..._args: unknown[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function dispatchGatewayMethodInProcess(..._args: unknown[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function createGatewaySubagentRuntime(..._args: unknown[]): any {
  return undefined;
}

export function createGatewayNodesRuntime(..._args: unknown[]): any {
  return undefined;
}

export function loadGatewayPlugins(..._args: unknown[]): any {
  return undefined;
}
