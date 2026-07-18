// 移植自 openclaw/src/channels/message/receipt.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createMessageReceiptFromOutboundResults(..._args: unknown[]): unknown {
  throw new Error("not implemented: createMessageReceiptFromOutboundResults");
}

export function listMessageReceiptPlatformIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: listMessageReceiptPlatformIds");
}

export function resolveMessageReceiptPrimaryId(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveMessageReceiptPrimaryId");
}
