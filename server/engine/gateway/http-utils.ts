/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/http-utils.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export const authorizeOpenAiCompatibleHttpModelOverride: unknown = undefined;

export const authorizeGatewayHttpRequestOrReply: unknown = undefined;

export const authorizeScopedGatewayHttpRequestOrReply: unknown = undefined;

export const checkGatewayHttpRequestAuth: unknown = undefined;

export const getBearerToken: unknown = undefined;

export const getHeader: unknown = undefined;

export const isGatewayBearerHttpRequest: unknown = undefined;

export const resolveHttpBrowserOriginPolicy: unknown = undefined;

export const resolveHttpSenderIsOwner: unknown = undefined;

export const resolveOpenAiCompatibleHttpOperatorScopes: unknown = undefined;

export const resolveOpenAiCompatibleHttpSenderIsOwner: unknown = undefined;

export const resolveSharedSecretHttpOperatorScopes: unknown = undefined;

export const resolveTrustedHttpOperatorScopes: unknown = undefined;

export const AuthorizedGatewayHttpRequest: unknown = undefined;

export const GatewayHttpRequestAuthCheckResult: unknown = undefined;

export function isUnknownGatewayAgentError(..._args: unknown[]): unknown {
  return false;
}

export function isGatewaySessionKeyOverrideError(..._args: unknown[]): unknown {
  return false;
}

export function resolveAgentIdFromModel(..._args: unknown[]): unknown {
  return undefined;
}

export async function resolveOpenAiCompatModelOverride(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function resolveAgentIdForRequest(..._args: unknown[]): unknown {
  return undefined;
}

export function resolveGatewayRequestContext(..._args: unknown[]): unknown {
  return undefined;
}

export class UnknownGatewayAgentError {
  constructor(..._args: unknown[]) {
    // Stub: not fully ported
  }
}

export class GatewaySessionKeyOverrideError {
  constructor(..._args: unknown[]) {
    // Stub: not fully ported
  }
}

export const OPENCLAW_MODEL_ID: unknown = undefined;

export const OPENCLAW_DEFAULT_MODEL_ID: unknown = undefined;
