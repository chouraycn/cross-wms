/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/server-shared-auth-generation.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type SharedGatewayAuthClient = unknown;

export type SharedGatewaySessionGenerationState = unknown;

export function disconnectStaleSharedGatewayAuthClients(..._args: unknown[]): unknown {
  return undefined;
}

export function disconnectAllSharedGatewayAuthClients(..._args: unknown[]): unknown {
  return undefined;
}

export function getRequiredSharedGatewaySessionGeneration(..._args: unknown[]): unknown {
  return undefined;
}

export function setCurrentSharedGatewaySessionGeneration(..._args: unknown[]): unknown {
  return undefined;
}

export function enforceSharedGatewaySessionGenerationForConfigWrite(..._args: unknown[]): unknown {
  return undefined;
}
