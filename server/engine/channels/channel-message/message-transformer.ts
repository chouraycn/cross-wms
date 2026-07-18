import { logger } from "../../../logger.js";
import type { ChannelMessage, RenderedMessagePart, RenderedMessagePartKind } from "../../../channels/message/types.js";

export interface TransformOptions {
  convertMarkdown?: boolean;
  truncateLength?: number;
  addMetadata?: boolean;
  normalizeContent?: boolean;
}

export interface TransformResult {
  message: ChannelMessage;
  transformed: boolean;
}

export function transformMessage(
  message: ChannelMessage,
  options: TransformOptions = {}
): TransformResult {
  const {
    convertMarkdown = false,
    truncateLength = 0,
    addMetadata = true,
    normalizeContent = true,
  } = options;

  let transformed = false;
  let content = message.content;

  if (normalizeContent) {
    content = normalizeText(content);
    if (content !== message.content) {
      transformed = true;
    }
  }

  if (truncateLength > 0 && content.length > truncateLength) {
    content = content.substring(0, truncateLength) + "...";
    transformed = true;
  }

  if (convertMarkdown && (message.metadata?.kind as string | undefined) === "text") {
    content = markdownToText(content);
    transformed = true;
  }

  const metadata = addMetadata ? enrichMetadata(message) : message.metadata;

  logger.debug(`[ChannelMessage:Transformer] Transformed message ${message.id}: ${transformed}`);

  return {
    message: {
      ...message,
      content,
      metadata,
    },
    transformed,
  };
}

export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function markdownToText(markdown: string): string {
  if (!markdown) return "";
  return markdown
    .replace(/[#*_`~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/>\s*/g, "")
    .trim();
}

export function enrichMetadata(message: ChannelMessage): Record<string, unknown> {
  const metadata = message.metadata ?? {};

  if (!metadata.transformedAt) {
    metadata.transformedAt = Date.now();
  }

  if (!metadata.contentLength) {
    metadata.contentLength = message.content.length;
  }

  if (!metadata.kind) {
    metadata.kind = message.metadata?.kind ?? "text";
  }

  return metadata;
}

export function convertMessageParts(parts: RenderedMessagePart[], targetKind: RenderedMessagePartKind): RenderedMessagePart[] {
  return parts.map((part) => {
    if (part.kind === targetKind) return part;

    if (part.kind === "text") {
      return {
        ...part,
        kind: "text",
        content: markdownToText(String(part.content)),
      };
    }

    return part;
  });
}

export function mergeMessageParts(parts: RenderedMessagePart[]): RenderedMessagePart[] {
  const textParts = parts.filter((p) => p.kind === "text");
  const otherParts = parts.filter((p) => p.kind !== "text");

  if (textParts.length <= 1) {
    return parts;
  }

  const mergedText = textParts.map((p) => String(p.content)).join("\n\n");
  const mergedPart: RenderedMessagePart = {
    kind: "text",
    content: mergedText,
  };

  return [mergedPart, ...otherParts];
}