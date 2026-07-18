/**
 * 移植自 openclaw/src/agents/provider-http-errors.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export class ProviderHttpError {
  constructor(..._args: unknown[]) {
    throw new Error("ProviderHttpError not implemented (openclaw stub)");
  }
}
export function asObject(..._args: unknown[]): unknown {
  throw new Error("asObject not implemented (openclaw stub)");
}
export function truncateErrorDetail(..._args: unknown[]): unknown {
  throw new Error("truncateErrorDetail not implemented (openclaw stub)");
}
export async function readResponseTextLimited(..._args: unknown[]): Promise<unknown> {
  throw new Error("readResponseTextLimited not implemented (openclaw stub)");
}
export function formatProviderErrorPayload(..._args: unknown[]): unknown {
  throw new Error("formatProviderErrorPayload not implemented (openclaw stub)");
}
export async function extractProviderErrorDetail(..._args: unknown[]): Promise<unknown> {
  throw new Error("extractProviderErrorDetail not implemented (openclaw stub)");
}
export function extractProviderRequestId(..._args: unknown[]): unknown {
  throw new Error("extractProviderRequestId not implemented (openclaw stub)");
}
export function formatProviderHttpErrorMessage(..._args: unknown[]): unknown {
  throw new Error("formatProviderHttpErrorMessage not implemented (openclaw stub)");
}
export async function createProviderHttpError(..._args: unknown[]): Promise<unknown> {
  throw new Error("createProviderHttpError not implemented (openclaw stub)");
}
export async function assertOkOrThrowProviderError(..._args: unknown[]): Promise<unknown> {
  throw new Error("assertOkOrThrowProviderError not implemented (openclaw stub)");
}
export async function assertOkOrThrowHttpError(..._args: unknown[]): Promise<unknown> {
  throw new Error("assertOkOrThrowHttpError not implemented (openclaw stub)");
}
export async function readProviderJsonResponse(..._args: unknown[]): Promise<unknown> {
  throw new Error("readProviderJsonResponse not implemented (openclaw stub)");
}
export async function readProviderJsonObjectResponse(..._args: unknown[]): Promise<unknown> {
  throw new Error("readProviderJsonObjectResponse not implemented (openclaw stub)");
}
export async function readProviderJsonArrayFieldResponse(..._args: unknown[]): Promise<unknown> {
  throw new Error("readProviderJsonArrayFieldResponse not implemented (openclaw stub)");
}
export function assertProviderBinaryResponseContent(..._args: unknown[]): unknown {
  throw new Error("assertProviderBinaryResponseContent not implemented (openclaw stub)");
}
export async function readProviderBinaryResponse(..._args: unknown[]): Promise<unknown> {
  throw new Error("readProviderBinaryResponse not implemented (openclaw stub)");
}
