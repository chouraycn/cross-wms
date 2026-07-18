/**
 * 移植自 openclaw/src/agents/chutes-oauth.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ChutesOAuthAppConfig = unknown;
export const CHUTES_AUTHORIZE_ENDPOINT: unknown = undefined;
export const CHUTES_TOKEN_ENDPOINT: unknown = undefined;
export const CHUTES_USERINFO_ENDPOINT: unknown = undefined;
export function generateChutesPkce(..._args: unknown[]): unknown {
  throw new Error("generateChutesPkce not implemented (openclaw stub)");
}
export function parseOAuthCallbackInput(..._args: unknown[]): unknown {
  throw new Error("parseOAuthCallbackInput not implemented (openclaw stub)");
}
export async function exchangeChutesCodeForTokens(..._args: unknown[]): Promise<unknown> {
  throw new Error("exchangeChutesCodeForTokens not implemented (openclaw stub)");
}
export async function refreshChutesTokens(..._args: unknown[]): Promise<unknown> {
  throw new Error("refreshChutesTokens not implemented (openclaw stub)");
}
