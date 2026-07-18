// 移植自 openclaw/src/channels/plugins/outbound/direct-text-media.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const resolvePayloadMediaUrls: unknown = undefined;

export const sendPayloadMediaSequence: unknown = undefined;

export const sendPayloadMediaSequenceAndFinalize: unknown = undefined;

export const sendPayloadMediaSequenceOrFallback: unknown = undefined;

export const sendTextMediaPayload: unknown = undefined;

export function resolveScopedChannelMediaMaxBytes(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveScopedChannelMediaMaxBytes");
}

export function createScopedChannelMediaMaxBytesResolver(..._args: unknown[]): unknown {
  throw new Error("not implemented: createScopedChannelMediaMaxBytesResolver");
}

export function createDirectTextMediaOutbound(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDirectTextMediaOutbound");
}
