// 移植自 openclaw/src/gateway/server-methods/chat-transcript-inject.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type GatewayInjectedAbortMeta = unknown;

export type GatewayInjectedTranscriptAppendResult = unknown;

export type GatewayInjectedTtsSupplementMarker = unknown;

export async function appendInjectedAssistantMessageToTranscript(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: appendInjectedAssistantMessageToTranscript");
}
