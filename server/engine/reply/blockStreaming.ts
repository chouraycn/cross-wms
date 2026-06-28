/**
 * Block Streaming
 * 双层缓冲机制 - Chunking（内容分块）+ Coalescing（投递聚合）
 */

import { MarkdownAwareChunker, stripReasoningTagsFromText } from "./markdownAwareChunker.js";
import type {
  BlockStreamingChunkingConfig,
  BlockStreamingCoalescingConfig,
  BlockReplyTextEvent,
  BlockReplyFinalEvent,
  ReasoningEvent,
  BlockReplyToolEvent,
  BlockReplyEventHandler,
} from "./types.js";

const DEFAULT_CHUNK_MIN_CHARS = 200;
const DEFAULT_CHUNK_MAX_CHARS = 500;
const DEFAULT_COALESCE_MIN_CHARS = 400;
const DEFAULT_COALESCE_MAX_CHARS = 1000;
const DEFAULT_COALESCE_IDLE_MS = 1000;

export function resolveEffectiveBlockStreamingConfig(params?: {
  chunking?: Partial<BlockStreamingChunkingConfig>;
  coalescing?: Partial<BlockStreamingCoalescingConfig>;
}): {
  chunking: BlockStreamingChunkingConfig;
  coalescing: BlockStreamingCoalescingConfig;
} {
  const chunking: BlockStreamingChunkingConfig = {
    minChars: params?.chunking?.minChars ?? DEFAULT_CHUNK_MIN_CHARS,
    maxChars: params?.chunking?.maxChars ?? DEFAULT_CHUNK_MAX_CHARS,
    breakPreference: params?.chunking?.breakPreference ?? "paragraph",
    flushOnParagraph: params?.chunking?.flushOnParagraph ?? true,
  };

  const joiner =
    params?.coalescing?.joiner ??
    (chunking.breakPreference === "sentence"
      ? " "
      : chunking.breakPreference === "newline"
        ? "\n"
        : "\n\n");

  const coalescing: BlockStreamingCoalescingConfig = {
    minChars: params?.coalescing?.minChars ?? DEFAULT_COALESCE_MIN_CHARS,
    maxChars: params?.coalescing?.maxChars ?? DEFAULT_COALESCE_MAX_CHARS,
    idleMs: params?.coalescing?.idleMs ?? DEFAULT_COALESCE_IDLE_MS,
    joiner,
    flushOnEnqueue: params?.coalescing?.flushOnEnqueue ?? false,
  };

  return { chunking, coalescing };
}

export class BlockStreamingPipeline {
  private readonly chunker: MarkdownAwareChunker;
  private readonly coalescingConfig: BlockStreamingCoalescingConfig;
  private readonly eventHandler: BlockReplyEventHandler;
  private readonly shouldAbort: () => boolean;

  private bufferText = "";
  private bufferBlockIndex = 0;
  private totalBlocks = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private disposed = false;
  private reasoningBuffer = "";

  constructor(params: {
    chunking: BlockStreamingChunkingConfig;
    coalescing: BlockStreamingCoalescingConfig;
    eventHandler: BlockReplyEventHandler;
    shouldAbort?: () => boolean;
  }) {
    this.chunker = new MarkdownAwareChunker(params.chunking);
    this.coalescingConfig = params.coalescing;
    this.eventHandler = params.eventHandler;
    this.shouldAbort = params.shouldAbort ?? (() => false);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleIdleFlush(): void {
    if (this.coalescingConfig.idleMs <= 0) {
      return;
    }
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.flush({ force: false });
    }, this.coalescingConfig.idleMs);
  }

  appendText(text: string): void {
    if (this.disposed || this.shouldAbort()) {
      return;
    }
    if (!text) {
      return;
    }

    const cleanedText = stripReasoningTagsFromText(text);
    if (!cleanedText) {
      return;
    }

    this.chunker.append(cleanedText);

    this.chunker.drain({
      force: false,
      emit: (chunk) => {
        this.enqueueChunk(chunk);
      },
    });
  }

  appendReasoning(text: string): void {
    if (this.disposed || this.shouldAbort()) {
      return;
    }
    if (!text) {
      return;
    }

    this.reasoningBuffer += text;

    const event: ReasoningEvent = {
      type: "reasoning",
      content: text,
      done: false,
      timestamp: Date.now(),
    };

    void Promise.resolve(this.eventHandler(event));
  }

  appendToolCall(toolCallId: string, toolName: string, toolInput?: string): void {
    if (this.disposed || this.shouldAbort()) {
      return;
    }

    void this.flush({ force: true });

    const event: BlockReplyToolEvent = {
      type: "block_reply_tool",
      toolCallId,
      toolName,
      toolInput,
      timestamp: Date.now(),
    };

    void Promise.resolve(this.eventHandler(event));
  }

  appendToolResult(toolCallId: string, toolName: string, result: unknown, isError = false): void {
    if (this.disposed || this.shouldAbort()) {
      return;
    }

    void this.flush({ force: true });

    const event: BlockReplyToolEvent = {
      type: "block_reply_tool",
      toolCallId,
      toolName,
      toolResult: result,
      isError,
      timestamp: Date.now(),
    };

    void Promise.resolve(this.eventHandler(event));
  }

  private enqueueChunk(chunk: string): void {
    if (!chunk || !chunk.trim()) {
      return;
    }

    if (this.coalescingConfig.flushOnEnqueue) {
      if (this.bufferText) {
        void this.flush({ force: true });
      }
      this.bufferText = chunk;
      this.bufferBlockIndex = this.chunker.currentBlockIndex - 1;
      void this.flush({ force: true });
      return;
    }

    const joiner = this.coalescingConfig.joiner;
    const nextText = this.bufferText ? `${this.bufferText}${joiner}${chunk}` : chunk;

    if (nextText.length > this.coalescingConfig.maxChars) {
      if (this.bufferText) {
        void this.flush({ force: true });
        this.bufferText = chunk;
        this.bufferBlockIndex = this.chunker.currentBlockIndex - 1;
      } else {
        this.bufferText = chunk;
        this.bufferBlockIndex = this.chunker.currentBlockIndex - 1;
        void this.flush({ force: true });
        return;
      }
    } else {
      this.bufferText = nextText;
      if (!this.bufferText) {
        this.bufferBlockIndex = this.chunker.currentBlockIndex - 1;
      }
    }

    if (this.bufferText.length >= this.coalescingConfig.maxChars) {
      void this.flush({ force: true });
      return;
    }

    this.scheduleIdleFlush();
  }

  async flush(options?: { force?: boolean }): Promise<void> {
    if (this.disposed || this.flushing) {
      return;
    }

    this.clearIdleTimer();

    if (this.shouldAbort()) {
      this.bufferText = "";
      return;
    }

    if (this.chunker.hasBuffered()) {
      this.chunker.drain({
        force: true,
        emit: (chunk) => {
          const joiner = this.coalescingConfig.joiner;
          if (this.bufferText) {
            this.bufferText = `${this.bufferText}${joiner}${chunk}`;
          } else {
            this.bufferText = chunk;
            this.bufferBlockIndex = this.chunker.currentBlockIndex - 1;
          }
        },
      });
    }

    if (!this.bufferText) {
      return;
    }

    const force = options?.force ?? false;
    if (!force && !this.coalescingConfig.flushOnEnqueue && this.bufferText.length < this.coalescingConfig.minChars) {
      this.scheduleIdleFlush();
      return;
    }

    this.flushing = true;

    try {
      const content = this.bufferText;
      const blockIndex = this.bufferBlockIndex;
      this.bufferText = "";
      this.bufferBlockIndex = 0;

      const event: BlockReplyTextEvent = {
        type: "block_reply_text",
        content,
        blockIndex,
        isFinal: false,
        timestamp: Date.now(),
      };

      await Promise.resolve(this.eventHandler(event));
      this.totalBlocks++;
    } finally {
      this.flushing = false;
    }

    if (this.bufferText) {
      this.scheduleIdleFlush();
    }
  }

  async finalize(metadata?: Record<string, unknown>): Promise<void> {
    if (this.disposed) {
      return;
    }

    await this.flush({ force: true });

    const finalEvent: BlockReplyFinalEvent = {
      type: "block_reply_final",
      content: "",
      totalBlocks: this.totalBlocks,
      metadata,
      timestamp: Date.now(),
    };

    await Promise.resolve(this.eventHandler(finalEvent));

    if (this.reasoningBuffer) {
      const reasoningDoneEvent: ReasoningEvent = {
        type: "reasoning",
        content: "",
        done: true,
        timestamp: Date.now(),
      };
      await Promise.resolve(this.eventHandler(reasoningDoneEvent));
    }
  }

  hasBuffered(): boolean {
    return this.bufferText.length > 0 || this.chunker.hasBuffered();
  }

  getStats(): {
    totalBlocks: number;
    bufferLength: number;
    chunkerBufferLength: number;
    reasoningBufferLength: number;
  } {
    return {
      totalBlocks: this.totalBlocks,
      bufferLength: this.bufferText.length,
      chunkerBufferLength: this.chunker.bufferedText.length,
      reasoningBufferLength: this.reasoningBuffer.length,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.clearIdleTimer();
    this.bufferText = "";
    this.chunker.reset();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

export function createBlockStreamingPipeline(params: {
  eventHandler: BlockReplyEventHandler;
  chunking?: Partial<BlockStreamingChunkingConfig>;
  coalescing?: Partial<BlockStreamingCoalescingConfig>;
  shouldAbort?: () => boolean;
}): BlockStreamingPipeline {
  const { chunking, coalescing } = resolveEffectiveBlockStreamingConfig({
    chunking: params.chunking,
    coalescing: params.coalescing,
  });

  return new BlockStreamingPipeline({
    chunking,
    coalescing,
    eventHandler: params.eventHandler,
    shouldAbort: params.shouldAbort,
  });
}
