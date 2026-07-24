/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/probe-auth.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export const resolveGatewayProbeTarget: unknown = undefined;

export const GatewayProbeTargetResolution: unknown = undefined;

export function resolveGatewayProbeCredentialConfig(..._args: unknown[]): unknown {
  return undefined;
}

export function resolveGatewayProbeAuth(..._args: unknown[]): unknown {
  return undefined;
}

export async function resolveGatewayProbeAuthWithSecretInputs(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function resolveGatewayProbeAuthSafeWithSecretInputs(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function resolveGatewayProbeAuthSafe(..._args: unknown[]): unknown {
  return undefined;
}
