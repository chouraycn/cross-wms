/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/http-auth-utils.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type AuthorizedGatewayHttpRequest = unknown;

export type GatewayHttpRequestAuthCheckResult = unknown;

export function getHeader(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getHeader not implemented");
}

export function getBearerToken(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getBearerToken not implemented");
}

export function resolveHttpBrowserOriginPolicy(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHttpBrowserOriginPolicy not implemented");
}

export async function authorizeGatewayHttpRequestOrReply(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] authorizeGatewayHttpRequestOrReply not implemented");
}

export async function checkGatewayHttpRequestAuth(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] checkGatewayHttpRequestAuth not implemented");
}

export async function authorizeScopedGatewayHttpRequestOrReply(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] authorizeScopedGatewayHttpRequestOrReply not implemented");
}

export function isGatewayBearerHttpRequest(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isGatewayBearerHttpRequest not implemented");
}

export function resolveTrustedHttpOperatorScopes(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveTrustedHttpOperatorScopes not implemented");
}

export function resolveOpenAiCompatibleHttpOperatorScopes(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveOpenAiCompatibleHttpOperatorScopes not implemented");
}

export function resolveSharedSecretHttpOperatorScopes(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveSharedSecretHttpOperatorScopes not implemented");
}

export function resolveHttpSenderIsOwner(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveHttpSenderIsOwner not implemented");
}

export function resolveOpenAiCompatibleHttpSenderIsOwner(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveOpenAiCompatibleHttpSenderIsOwner not implemented");
}

export function authorizeOpenAiCompatibleHttpModelOverride(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] authorizeOpenAiCompatibleHttpModelOverride not implemented");
}
