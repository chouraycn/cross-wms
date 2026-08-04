import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { ChannelMessage, MessagePart, MessageCapabilities } from "./types.js";
import type { ChannelTarget } from "../targets.js";
import { advanceMessagePhase, trackMessageLifecycle } from "./lifecycle.js";

export interface MessageSendOptions {
  durability?: "required" | "best_effort";
  retryCount?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  channelMessageId?: string;
  error?: string;
  retryable?: boolean;
}

type SendAdapter = (message: ChannelMessage, options: MessageSendOptions) => Promise<MessageSendResult>;

const sendAdapters = new Map<ChannelId, SendAdapter>();

export function registerSendAdapter(channelId: ChannelId, adapter: SendAdapter): void {
  sendAdapters.set(channelId, adapter);
}

export function unregisterSendAdapter(channelId: ChannelId): void {
  sendAdapters.delete(channelId);
}

export async function sendMessage(
  message: ChannelMessage,
  options: MessageSendOptions = {}
): Promise<MessageSendResult> {
  const { retryCount = 0 } = options;

  logger.debug(`[Message:Send] Sending message ${message.id} to ${message.channelId}`);

  trackMessageLifecycle(message);
  advanceMessagePhase(message.id, "sending");

  const adapter = sendAdapters.get(message.channelId);

  if (!adapter) {
    const result: MessageSendResult = {
      success: false,
      error: `No send adapter registered for channel: ${message.channelId}`,
      retryable: false,
    };
    advanceMessagePhase(message.id, "failed", { error: result.error });
    return result;
  }

  try {
    const result = await adapter(message, options);

    if (result.success) {
      advanceMessagePhase(message.id, "sent", { channelMessageId: result.channelMessageId });
    } else {
      advanceMessagePhase(message.id, "failed", { error: result.error });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const result: MessageSendResult = {
      success: false,
      error,
      retryable: retryCount < 3,
    };
    advanceMessagePhase(message.id, "failed", { error });
    return result;
  }
}

export function createOutboundMessage(params: {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  content: string;
  target?: ChannelTarget;
  parts?: MessagePart[];
  replyTo?: string;
  capabilities?: MessageCapabilities;
  metadata?: Record<string, unknown>;
}): ChannelMessage {
  return {
    id: params.id,
    channelId: params.channelId,
    accountId: params.accountId,
    direction: "outbound",
    status: "pending",
    kind: "text",
    content: params.content,
    parts: params.parts,
    target: params.target,
    replyTo: params.replyTo,
    timestamp: Date.now(),
    metadata: params.metadata,
  };
}

export function buildMessageParts(content: string, capabilities?: MessageCapabilities): MessagePart[] {
  const parts: MessagePart[] = [];

  if (capabilities?.markdown) {
    parts.push({ kind: "markdown", content });
  } else {
    parts.push({ kind: "text", content });
  }

  return parts;
}

export async function sendMessageWithRetry(
  message: ChannelMessage,
  options: MessageSendOptions & { maxRetries?: number; retryDelayMs?: number } = {}
): Promise<MessageSendResult> {
  const { maxRetries = 3, retryDelayMs = 1000, ...sendOptions } = options;
  let lastResult: MessageSendResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }

    lastResult = await sendMessage(message, {
      ...sendOptions,
      retryCount: attempt,
    });

    if (lastResult.success || !lastResult.retryable) {
      return lastResult;
    }

    logger.warn(`[Message:Send] Retry ${attempt + 1}/${maxRetries} for message ${message.id}`);
  }

  return lastResult ?? { success: false, error: "Max retries exceeded", retryable: false };
}

// ============================================================================
// 以下为 openclaw send.ts 中存在、但 cross-wms 未合并的 durable message API。
// 提供最小可运行 stub：直接抛错或返回失败结果，避免引入未合并的 deliver/outbound 依赖。
// ============================================================================

/**
 * Durable 消息批量发送参数。最小类型 stub。
 * 完整定义见 openclaw/src/channels/message/send.ts:34。
 */
export type DurableMessageBatchSendParams = {
  channel: string;
  to: string;
  accountId?: string;
  payloads: unknown[];
  attempt?: number;
  signal?: AbortSignal;
  /** @deprecated Use `signal`. */
  abortSignal?: AbortSignal;
  previousReceipt?: unknown;
  [key: string]: unknown;
};

/**
 * Durable 消息批量发送结果。最小类型 stub。
 * 完整定义见 openclaw/src/channels/message/send.ts:75。
 */
export type DurableMessageBatchSendResult = {
  status: "sent" | "suppressed" | "partial_failed" | "failed";
  results?: unknown[];
  receipt?: unknown;
  deliveryIntent?: unknown;
  payloadOutcomes?: unknown[];
  reason?: string;
  error?: unknown;
  stage?: string;
  sentBeforeError?: boolean;
};

/**
 * Durable 消息发送上下文参数。最小类型 stub。
 */
export type DurableMessageSendContextParams = DurableMessageBatchSendParams & {
  durability?: "required" | "best_effort";
  onDeliveryIntent?: (intent: unknown) => void;
  preview?: unknown;
  onPreviewUpdate?: (
    rendered: unknown,
    state: unknown,
  ) => Promise<unknown> | unknown;
  onEditReceipt?: (receipt: unknown, rendered: unknown) => Promise<unknown> | unknown;
  onDeleteReceipt?: (receipt: unknown) => Promise<void> | void;
  onCommitReceipt?: (receipt: unknown) => Promise<void> | void;
  onSendFailure?: (error: unknown) => Promise<void> | void;
};

/**
 * Durable 消息发送上下文。最小类型 stub。
 */
export type DurableMessageSendContext = {
  id: string;
  channel: string;
  to: string;
  accountId?: string;
  durability: "required" | "best_effort";
  attempt: number;
  signal: AbortSignal;
  previousReceipt?: unknown;
  preview: unknown;
  render: () => Promise<unknown>;
  previewUpdate: (rendered: unknown) => Promise<unknown>;
  commit: (receipt?: unknown) => Promise<unknown>;
  fail: (error: unknown) => Promise<void>;
};

/**
 * Stub: durable 消息批量发送。
 *
 * 对应 openclaw 版本的 sendDurableMessageBatch：
 * 完整实现会通过 deliverOutboundPayloadsInternal 进行实际投递，
 * 并通过 createRenderedMessageBatch 构造渲染批次。
 *
 * 此 stub 直接返回 failed 结果，避免引入未合并的 deliver/outbound 依赖。
 */
export async function sendDurableMessageBatch(
  _params: DurableMessageBatchSendParams,
): Promise<DurableMessageBatchSendResult> {
  return {
    status: "failed",
    error: new Error(
      "[stub] sendDurableMessageBatch not yet merged from openclaw",
    ),
    stage: "platform_send",
  };
}

/**
 * Stub: 创建 durable 消息发送上下文并执行回调。
 *
 * 对应 openclaw 版本的 withDurableMessageSendContext。
 * 此 stub 直接调用 run(ctx) 并传入最小 ctx，避免引入未合并的依赖。
 */
export async function withDurableMessageSendContext<T>(
  params: DurableMessageSendContextParams,
  run: (ctx: DurableMessageSendContext) => Promise<T>,
): Promise<T> {
  const effectiveSignal = params.signal ?? params.abortSignal;
  const ctx: DurableMessageSendContext = {
    id: `${params.channel}:${params.to}`,
    channel: params.channel,
    to: params.to,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    durability: params.durability ?? "required",
    attempt: params.attempt ?? 1,
    signal: effectiveSignal ?? new AbortController().signal,
    ...(params.previousReceipt ? { previousReceipt: params.previousReceipt } : {}),
    preview: params.preview ?? {},
    render: async () => ({ payloads: params.payloads }),
    previewUpdate: async (rendered) => rendered,
    commit: async (receipt) => receipt,
    fail: async (error) => {
      await params.onSendFailure?.(error);
    },
  };
  return run(ctx);
}
