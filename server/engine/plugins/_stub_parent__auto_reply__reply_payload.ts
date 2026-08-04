/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// === MIGRATED FROM OPENCLAW SOURCE (partial) ===
// Source: openclaw/src/auto-reply/reply-payload.ts
// Status: 已移植 ReplyPayload 类型定义（扩展字段）+ copyReplyPayloadMetadata WeakMap 实现
// Used by: server/engine/plugins/{hook-types,conversation-binding.types,conversation-binding,hooks}.ts
// 注：openclaw ReplyPayload 依赖 InteractiveReply/MessagePresentation 等类型，
//      此处保留 channelData 兼容字段。copyReplyPayloadMetadata 已移植 WeakMap 元数据复制实现。

/** Channel-agnostic assistant reply payload. */
export interface ReplyPayload {
  role?: string;
  content?: string;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  /** Internal-only trust signal for gateway webchat local media embedding. */
  trustedLocalMedia?: boolean;
  /** Treat media as live-only content and avoid persisting the underlying media reference. */
  sensitiveMedia?: boolean;
  /** @deprecated Use presentation. Internal legacy representation. */
  interactive?: { [key: string]: unknown };
  presentation?: { [key: string]: unknown };
  delivery?: { [key: string]: unknown };
  btw?: { question: string };
  replyToId?: string;
  replyToTag?: boolean;
  replyToCurrent?: boolean;
  audioAsVoice?: boolean;
  spokenText?: string;
  ttsSupplement?: { spokenText: string; visibleTextAlreadyDelivered?: boolean };
  isError?: boolean;
  isReasoning?: boolean;
  isReasoningSnapshot?: boolean;
  isCompactionNotice?: boolean;
  isFallbackNotice?: boolean;
  isStatusNotice?: boolean;
  /** Channel-specific payload data (per-channel envelope). */
  channelData?: Record<string, unknown>;
}

/** Internal metadata attached to reply payload objects via WeakMap. */
export type ReplyPayloadMetadata = {
  assistantMessageIndex?: number;
  assistantTranscriptOwned?: boolean;
  replyToIdExplicit?: boolean;
  replyDelivery?: {
    chatType?: "direct" | "group" | "channel" | null;
    replyToMode?: string;
  };
  replyDeliverySource?: {
    channel: string;
    accountId?: string;
  };
  deliverDespiteSourceReplySuppression?: boolean;
  sourceReplyTranscriptMirror?: {
    sessionKey: string;
    agentId?: string;
    text?: string;
    mediaUrls?: string[];
    idempotencyKey?: string;
  };
  beforeAgentRunBlocked?: boolean;
  nonTerminalToolErrorWarning?: boolean;
};

const replyPayloadMetadata = new WeakMap<object, ReplyPayloadMetadata>();

/** Adds internal metadata to a reply payload object. */
export function setReplyPayloadMetadata<T extends object>(
  payload: T,
  metadata: ReplyPayloadMetadata,
): T {
  const previous = replyPayloadMetadata.get(payload);
  replyPayloadMetadata.set(payload, { ...previous, ...metadata });
  return payload;
}

/** Reads internal metadata attached to a reply payload object. */
export function getReplyPayloadMetadata(payload: object): ReplyPayloadMetadata | undefined {
  return replyPayloadMetadata.get(payload);
}

/** Copies internal payload metadata when cloning or transforming payload objects. */
export function copyReplyPayloadMetadata<T extends object>(source: object, payload: T): T {
  const metadata = getReplyPayloadMetadata(source);
  return metadata ? setReplyPayloadMetadata(payload, metadata) : payload;
}
