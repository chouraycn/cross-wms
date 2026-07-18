import { logger } from "../../../logger.js";
import type { ChannelMessage, MessagePart } from "./types.js";

export type ReplyStage = "prefix" | "content" | "suffix" | "postprocess";

export interface ReplyPipelineContext {
  originalMessage: ChannelMessage;
  replyContent: string;
  replyParts: MessagePart[];
  metadata: Record<string, unknown>;
  aborted: boolean;
}

export type ReplyMiddleware = (
  context: ReplyPipelineContext,
  next: () => Promise<void>
) => Promise<void>;

const replyMiddlewares: Map<ReplyStage, ReplyMiddleware[]> = new Map();

export function registerReplyMiddleware(
  stage: ReplyStage,
  middleware: ReplyMiddleware
): () => void {
  if (!replyMiddlewares.has(stage)) {
    replyMiddlewares.set(stage, []);
  }
  replyMiddlewares.get(stage)!.push(middleware);

  return () => {
    const list = replyMiddlewares.get(stage);
    if (list) {
      const idx = list.indexOf(middleware);
      if (idx >= 0) list.splice(idx, 1);
    }
  };
}

export function clearReplyMiddlewares(stage?: ReplyStage): void {
  if (stage) {
    replyMiddlewares.delete(stage);
  } else {
    replyMiddlewares.clear();
  }
}

export async function runReplyPipeline(
  originalMessage: ChannelMessage,
  replyContent: string
): Promise<ReplyPipelineContext> {
  const context: ReplyPipelineContext = {
    originalMessage,
    replyContent,
    replyParts: [],
    metadata: {},
    aborted: false,
  };

  logger.debug(`[Message:ReplyPipeline] Running pipeline for ${originalMessage.id}`);

  const stages: ReplyStage[] = ["prefix", "content", "suffix", "postprocess"];

  for (const stage of stages) {
    if (context.aborted) break;

    const middlewares = replyMiddlewares.get(stage) ?? [];

    await runStageMiddlewares(context, middlewares, 0);
  }

  return context;
}

async function runStageMiddlewares(
  context: ReplyPipelineContext,
  middlewares: ReplyMiddleware[],
  index: number
): Promise<void> {
  if (index >= middlewares.length || context.aborted) return;

  const middleware = middlewares[index];

  try {
    await middleware(context, async () => {
      await runStageMiddlewares(context, middlewares, index + 1);
    });
  } catch (err) {
    logger.error(`[Message:ReplyPipeline] Middleware error`, { error: err });
  }
}

export function abortReplyPipeline(context: ReplyPipelineContext): void {
  context.aborted = true;
}

export function addReplyPrefix(context: ReplyPipelineContext, prefix: string): void {
  context.replyContent = prefix + context.replyContent;
}

export function addReplySuffix(context: ReplyPipelineContext, suffix: string): void {
  context.replyContent = context.replyContent + suffix;
}

export function addReplyPart(context: ReplyPipelineContext, part: MessagePart): void {
  context.replyParts.push(part);
}
