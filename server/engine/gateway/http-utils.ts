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

export const authorizeOpenAiCompatibleHttpModelOverride: any = undefined;

export const authorizeGatewayHttpRequestOrReply: any = undefined;

export const authorizeScopedGatewayHttpRequestOrReply: any = undefined;

export const checkGatewayHttpRequestAuth: any = undefined;

export const getBearerToken: any = undefined;

export const getHeader: any = undefined;

export const isGatewayBearerHttpRequest: any = undefined;

export const resolveHttpBrowserOriginPolicy: any = undefined;

export const resolveHttpSenderIsOwner: any = undefined;

export const resolveOpenAiCompatibleHttpOperatorScopes: any = undefined;

export const resolveOpenAiCompatibleHttpSenderIsOwner: any = undefined;

export const resolveSharedSecretHttpOperatorScopes: any = undefined;

export const resolveTrustedHttpOperatorScopes: any = undefined;

export const AuthorizedGatewayHttpRequest: any = undefined;

export const GatewayHttpRequestAuthCheckResult: any = undefined;

export function isUnknownGatewayAgentError(..._args: unknown[]): any {
  return false;
}

export function isGatewaySessionKeyOverrideError(..._args: unknown[]): any {
  return false;
}

export function resolveAgentIdFromModel(..._args: unknown[]): any {
  return undefined;
}

export async function resolveOpenAiCompatModelOverride(..._args: unknown[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function resolveAgentIdForRequest(..._args: unknown[]): any {
  return undefined;
}

export function resolveGatewayRequestContext(..._args: unknown[]): any {
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

export const OPENCLAW_MODEL_ID: any = undefined;

export const OPENCLAW_DEFAULT_MODEL_ID: any = undefined;
