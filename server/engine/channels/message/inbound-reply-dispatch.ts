import { logger } from "../../../logger.js";
import type { ChannelId } from "../../../channels/types.js";
import type { ChannelMessage } from "./types.js";

export type ReplyDispatchMode = "sequential" | "parallel" | "batched";

export interface InboundReplyHandler {
  channelId: ChannelId;
  handle: (message: ChannelMessage, reply: string) => Promise<void>;
  priority?: number;
}

export interface ReplyDispatchOptions {
  mode?: ReplyDispatchMode;
  timeoutMs?: number;
  maxRetries?: number;
}

const replyHandlers = new Map<ChannelId, InboundReplyHandler[]>();

export function registerInboundReplyHandler(handler: InboundReplyHandler): void {
  const { channelId } = handler;
  if (!replyHandlers.has(channelId)) {
    replyHandlers.set(channelId, []);
  }

  const handlers = replyHandlers.get(channelId)!;
  handlers.push(handler);
  handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  logger.debug(`[Message:InboundReplyDispatch] Registered handler for ${channelId}`);
}

export function unregisterInboundReplyHandler(channelId: ChannelId): void {
  replyHandlers.delete(channelId);
}

export async function dispatchInboundReply(
  message: ChannelMessage,
  replyContent: string,
  options: ReplyDispatchOptions = {}
): Promise<boolean> {
  const { mode = "sequential", timeoutMs = 30000 } = options;

  const handlers = replyHandlers.get(message.channelId) ?? [];

  if (handlers.length === 0) {
    logger.warn(`[Message:InboundReplyDispatch] No handlers for channel ${message.channelId}`);
    return false;
  }

  logger.debug(`[Message:InboundReplyDispatch] Dispatching reply for ${message.id} via ${mode}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (mode === "parallel") {
      await dispatchParallel(handlers, message, replyContent, controller.signal);
    } else if (mode === "batched") {
      await dispatchBatched(handlers, message, replyContent, controller.signal);
    } else {
      await dispatchSequential(handlers, message, replyContent, controller.signal);
    }

    return true;
  } catch (err) {
    logger.error(`[Message:InboundReplyDispatch] Dispatch failed for ${message.id}`, { error: err });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function dispatchSequential(
  handlers: InboundReplyHandler[],
  message: ChannelMessage,
  reply: string,
  signal: AbortSignal
): Promise<void> {
  for (const handler of handlers) {
    if (signal.aborted) break;

    try {
      await handler.handle(message, reply);
    } catch (err) {
      logger.error(`[Message:InboundReplyDispatch] Handler error for ${message.channelId}`, { error: err });
    }
  }
}

async function dispatchParallel(
  handlers: InboundReplyHandler[],
  message: ChannelMessage,
  reply: string,
  signal: AbortSignal
): Promise<void> {
  const promises = handlers.map(async (handler) => {
    if (signal.aborted) return;
    try {
      await handler.handle(message, reply);
    } catch (err) {
      logger.error(`[Message:InboundReplyDispatch] Handler error`, { error: err });
    }
  });

  await Promise.all(promises);
}

async function dispatchBatched(
  handlers: InboundReplyHandler[],
  message: ChannelMessage,
  reply: string,
  signal: AbortSignal
): Promise<void> {
  const batchSize = 5;
  for (let i = 0; i < handlers.length; i += batchSize) {
    if (signal.aborted) break;
    const batch = handlers.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (h) => {
        try {
          await h.handle(message, reply);
        } catch (err) {
          logger.error(`[Message:InboundReplyDispatch] Batch handler error`, { error: err });
        }
      })
    );
  }
}

export function hasReplyHandlers(channelId: ChannelId): boolean {
  return (replyHandlers.get(channelId)?.length ?? 0) > 0;
}

export function getReplyHandlerCount(channelId: ChannelId): number {
  return replyHandlers.get(channelId)?.length ?? 0;
}
