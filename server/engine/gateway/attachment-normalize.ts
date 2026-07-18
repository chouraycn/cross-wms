// 移植自 openclaw/src/gateway/server-methods/attachment-normalize.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type RpcAttachmentInput = unknown;

export function normalizeRpcAttachmentsToChatAttachments(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeRpcAttachmentsToChatAttachments");
}
