// 移植自 openclaw/src/channels/message/live.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type LiveMessagePhase = unknown;

export type LiveMessageState = unknown;

export type LivePreviewFinalizerDraft = unknown;

export type LivePreviewFinalizerResultKind = unknown;

export type LivePreviewFinalizerResult = unknown;

export type FinalizableLivePreviewAdapter = unknown;

export function defineFinalizableLivePreviewAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: defineFinalizableLivePreviewAdapter");
}

export function createLiveMessageState(..._args: unknown[]): unknown {
  throw new Error("not implemented: createLiveMessageState");
}

export function markLiveMessageFinalized(..._args: unknown[]): unknown {
  throw new Error("not implemented: markLiveMessageFinalized");
}

export function createPreviewMessageReceipt(..._args: unknown[]): unknown {
  throw new Error("not implemented: createPreviewMessageReceipt");
}

export async function deliverFinalizableLivePreview(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: deliverFinalizableLivePreview");
}

export async function deliverWithFinalizableLivePreviewAdapter(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: deliverWithFinalizableLivePreviewAdapter");
}

export function markLiveMessagePreviewUpdated(..._args: unknown[]): unknown {
  throw new Error("not implemented: markLiveMessagePreviewUpdated");
}

export function markLiveMessageCancelled(..._args: unknown[]): unknown {
  throw new Error("not implemented: markLiveMessageCancelled");
}
