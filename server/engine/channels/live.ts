// 移植自 openclaw/src/channels/message/live.ts

export type LiveMessagePhase = unknown;

export type LiveMessageState = unknown;

export type LivePreviewFinalizerDraft = unknown;

export type LivePreviewFinalizerResultKind = unknown;

export type LivePreviewFinalizerResult = unknown;

export type FinalizableLivePreviewAdapter = unknown;

export function defineFinalizableLivePreviewAdapter(..._args: any[]): any {
  return undefined;
}

export function createLiveMessageState(..._args: any[]): any {
  return undefined;
}

export function markLiveMessageFinalized(..._args: any[]): any {
  return undefined;
}

export function createPreviewMessageReceipt(..._args: any[]): any {
  return undefined;
}

export async function deliverFinalizableLivePreview(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function deliverWithFinalizableLivePreviewAdapter(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function markLiveMessagePreviewUpdated(..._args: any[]): any {
  return undefined;
}

export function markLiveMessageCancelled(..._args: any[]): any {
  return undefined;
}
