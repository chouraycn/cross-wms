/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/credentials.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export const hasGatewayPasswordEnvCandidate: unknown = undefined;

export const hasGatewayTokenEnvCandidate: unknown = undefined;

export const trimToUndefined: unknown = undefined;

export type ExplicitGatewayAuth = unknown;

export type GatewayCredentialMode = unknown;

export type GatewayCredentialPrecedence = unknown;

export type GatewayRemoteCredentialPrecedence = unknown;

export type GatewayRemoteCredentialFallback = unknown;

export function isGatewaySecretRefUnavailableError(..._args: unknown[]): unknown {
  return false;
}

export function resolveGatewayCredentialsFromValues(..._args: unknown[]): unknown {
  return undefined;
}

export function resolveGatewayCredentialsFromConfig(..._args: unknown[]): unknown {
  return undefined;
}

export function resolveGatewayProbeCredentialsFromConfig(..._args: unknown[]): unknown {
  return undefined;
}

export class GatewaySecretRefUnavailableError {
  constructor(..._args: unknown[]) {
    // Stub: not fully ported
  }
}
