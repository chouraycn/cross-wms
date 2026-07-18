// 移植自 openclaw/src/gateway/server-methods/chat-webchat-media.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function buildWebchatAudioContentBlocksFromReplyPayloads(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: buildWebchatAudioContentBlocksFromReplyPayloads");
}

export async function buildWebchatAssistantMessageFromReplyPayloads(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: buildWebchatAssistantMessageFromReplyPayloads");
}
