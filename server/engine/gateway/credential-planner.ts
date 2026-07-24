/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/credential-planner.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type GatewayCredentialPlan = {
  passwordCanWin: boolean;
  authMode: 'password' | 'token' | 'none' | 'trusted-proxy' | string;
  envToken: boolean;
  envPassword: boolean;
  localToken: { configured: boolean; hasSecretRef: boolean };
  remoteToken: { configured: boolean; hasSecretRef: boolean };
  localPassword: { configured: boolean; hasSecretRef: boolean };
  remotePassword: { configured: boolean; hasSecretRef: boolean };
  remoteMode: boolean;
  remoteUrlConfigured: boolean;
  tailscaleRemoteExposure: boolean;
  remoteConfiguredSurface: boolean;
  remoteTokenFallbackActive: boolean;
  remotePasswordFallbackActive: boolean;
  localTokenCanWin: boolean;
  localTokenSurfaceActive: boolean;
  remoteTokenActive: boolean;
  remotePasswordActive: boolean;
};

export function trimCredentialToUndefined(..._args: unknown[]): unknown {
  return undefined;
}

export function hasGatewayTokenEnvCandidate(..._args: unknown[]): unknown {
  return false;
}

export function hasGatewayPasswordEnvCandidate(..._args: unknown[]): unknown {
  return false;
}

export function createGatewayCredentialPlan(..._args: unknown[]): GatewayCredentialPlan {
  return undefined as unknown as GatewayCredentialPlan;
}

export const trimToUndefined: unknown = undefined;
