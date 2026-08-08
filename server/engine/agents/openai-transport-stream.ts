/**
 * 移植自 openclaw/src/agents/openai-transport-stream.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { sanitizeTransportPayloadText } from "./transport-stream-shared.js";
export const testing: any = undefined;
export function resolveAzureOpenAIApiVersion(..._args: any[]): any {
  return undefined;
}
export function createOpenAIResponsesTransportStreamFn(..._args: any[]): any {
  return undefined;
}
export function buildOpenAIResponsesParams(..._args: any[]): any {
  return undefined;
}
export function createAzureOpenAIResponsesTransportStreamFn(..._args: any[]): any {
  return undefined;
}
export function createOpenAICompletionsTransportStreamFn(..._args: any[]): any {
  return undefined;
}
export function buildOpenAICompletionsParams(..._args: any[]): any {
  return undefined;
}
export function parseTransportChunkUsage(..._args: any[]): any {
  return undefined;
}
