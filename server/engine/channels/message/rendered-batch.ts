import { logger } from "../../../logger.js";
import type { MessagePart, ChannelMessage } from "./types.js";

export interface RenderedBatch {
  id: string;
  parts: MessagePart[];
  textContent: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface RenderBatchOptions {
  maxParts?: number;
  maxTextLength?: number;
  splitLongMessages?: boolean;
  preserveOrder?: boolean;
}

const defaultOptions: Required<RenderBatchOptions> = {
  maxParts: 100,
  maxTextLength: 10000,
  splitLongMessages: false,
  preserveOrder: true,
};

export function createRenderedBatch(
  messageId: string,
  parts: MessagePart[],
  options: RenderBatchOptions = {}
): RenderedBatch {
  const opts = { ...defaultOptions, ...options };

  const limitedParts = parts.slice(0, opts.maxParts);
  const textParts = limitedParts.filter((p) => p.kind === "text" || p.kind === "markdown");
  const textContent = textParts
    .map((p) => String(p.content))
    .join("\n")
    .slice(0, opts.maxTextLength);

  const batch: RenderedBatch = {
    id: `${messageId}-batch-${Date.now()}`,
    parts: limitedParts,
    textContent,
    metadata: {},
    createdAt: Date.now(),
  };

  logger.debug(`[Message:RenderedBatch] Created batch ${batch.id} with ${limitedParts.length} parts`);

  return batch;
}

export function mergeRenderedBatches(batches: RenderedBatch[]): RenderedBatch {
  if (batches.length === 0) {
    return {
      id: `empty-batch-${Date.now()}`,
      parts: [],
      textContent: "",
      metadata: {},
      createdAt: Date.now(),
    };
  }

  const allParts = batches.flatMap((b) => b.parts);
  const allText = batches.map((b) => b.textContent).join("\n");
  const mergedMetadata = Object.assign({}, ...batches.map((b) => b.metadata));

  return {
    id: `merged-${Date.now()}`,
    parts: allParts,
    textContent: allText,
    metadata: mergedMetadata,
    createdAt: Date.now(),
  };
}

export function splitRenderedBatch(batch: RenderedBatch, maxParts: number): RenderedBatch[] {
  if (batch.parts.length <= maxParts) {
    return [batch];
  }

  const result: RenderedBatch[] = [];
  for (let i = 0; i < batch.parts.length; i += maxParts) {
    const slice = batch.parts.slice(i, i + maxParts);
    result.push({
      id: `${batch.id}-${i / maxParts}`,
      parts: slice,
      textContent: slice
        .filter((p) => p.kind === "text" || p.kind === "markdown")
        .map((p) => String(p.content))
        .join("\n"),
      metadata: { ...batch.metadata, partIndex: i / maxParts },
      createdAt: Date.now(),
    });
  }

  return result;
}

export function renderMessageToBatch(
  message: ChannelMessage,
  options: RenderBatchOptions = {}
): RenderedBatch {
  const parts: MessagePart[] = [];

  if (message.parts && message.parts.length > 0) {
    parts.push(...message.parts);
  } else if (message.content) {
    parts.push({ kind: "text", content: message.content });
  }

  return createRenderedBatch(message.id, parts, options);
}

export function addPartToBatch(batch: RenderedBatch, part: MessagePart): RenderedBatch {
  return {
    ...batch,
    parts: [...batch.parts, part],
    textContent:
      part.kind === "text" || part.kind === "markdown"
        ? batch.textContent + "\n" + String(part.content)
        : batch.textContent,
  };
}

export function getBatchStats(batch: RenderedBatch): {
  totalParts: number;
  textParts: number;
  mediaParts: number;
  textLength: number;
} {
  const textParts = batch.parts.filter((p) => p.kind === "text" || p.kind === "markdown").length;
  const mediaParts = batch.parts.filter(
    (p) => p.kind === "image" || p.kind === "file" || p.kind === "audio" || p.kind === "video"
  ).length;

  return {
    totalParts: batch.parts.length,
    textParts,
    mediaParts,
    textLength: batch.textContent.length,
  };
}
