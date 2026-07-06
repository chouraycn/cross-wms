export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  imageTokens?: number;
}

export type StreamEventType =
  | 'start'
  | 'token'
  | 'thinking_start'
  | 'thinking_token'
  | 'thinking_end'
  | 'tool_call'
  | 'tool_result'
  | 'usage'
  | 'finish'
  | 'error'
  | 'metadata'
  | 'chunk';

export interface LlmStreamEvent {
  type: StreamEventType;
  content?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  usage?: LlmUsage;
  error?: string;
  model?: string;
  finishReason?: string;
  timestamp: number;
  index?: number;
  metadata?: Record<string, unknown>;
  chunkId?: string;
}

export class UsageTracker {
  private totalUsage: LlmUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  addUsage(usage: Partial<LlmUsage>): void {
    this.totalUsage.promptTokens += usage.promptTokens ?? 0;
    this.totalUsage.completionTokens += usage.completionTokens ?? 0;
    this.totalUsage.totalTokens += usage.totalTokens ?? 0;
    this.totalUsage.cachedTokens =
      (this.totalUsage.cachedTokens ?? 0) + (usage.cachedTokens ?? 0);
    this.totalUsage.reasoningTokens =
      (this.totalUsage.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0);
    this.totalUsage.imageTokens =
      (this.totalUsage.imageTokens ?? 0) + (usage.imageTokens ?? 0);
  }

  getTotal(): LlmUsage {
    return { ...this.totalUsage };
  }

  reset(): void {
    this.totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  estimateCost(
    pricePerInputToken: number,
    pricePerOutputToken: number,
  ): number {
    return (
      this.totalUsage.promptTokens * pricePerInputToken +
      this.totalUsage.completionTokens * pricePerOutputToken
    );
  }
}

export interface StreamTransformerOptions {
  chunkSize?: number;
  delayMs?: number;
  onToken?: (token: string) => void;
  onError?: (error: Error) => void;
}

export class StreamTransformer {
  private chunkSize: number;
  private delayMs: number;
  private buffer: string = '';
  private onToken?: (token: string) => void;
  private onError?: (error: Error) => void;

  constructor(options: StreamTransformerOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1;
    this.delayMs = options.delayMs ?? 0;
    this.onToken = options.onToken;
    this.onError = options.onError;
  }

  async *transform(stream: AsyncGenerator<LlmStreamEvent>): AsyncGenerator<LlmStreamEvent> {
    for await (const event of stream) {
      try {
        if (event.type === 'token' && event.content) {
          this.buffer += event.content;

          while (this.buffer.length >= this.chunkSize) {
            const chunk = this.buffer.slice(0, this.chunkSize);
            this.buffer = this.buffer.slice(this.chunkSize);

            if (this.onToken) {
              this.onToken(chunk);
            }

            yield {
              ...event,
              content: chunk,
              type: 'token' as const,
            };

            if (this.delayMs > 0) {
              await this.delay(this.delayMs);
            }
          }
        } else {
          yield event;
        }
      } catch (error) {
        if (this.onError) {
          this.onError(error as Error);
        }
        yield {
          type: 'error',
          error: (error as Error).message,
          timestamp: Date.now(),
        };
      }
    }

    if (this.buffer.length > 0) {
      if (this.onToken) {
        this.onToken(this.buffer);
      }
      yield {
        type: 'token',
        content: this.buffer,
        timestamp: Date.now(),
      };
      this.buffer = '';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  flush(): string {
    const content = this.buffer;
    this.buffer = '';
    return content;
  }
}

export interface SseStreamOptions {
  eventName?: string;
  dataField?: string;
  retryMs?: number;
}

export class SseStreamWriter {
  private eventName: string;
  private dataField: string;
  private retryMs: number;

  constructor(options: SseStreamOptions = {}) {
    this.eventName = options.eventName ?? 'message';
    this.dataField = options.dataField ?? 'data';
    this.retryMs = options.retryMs ?? 5000;
  }

  formatEvent(event: LlmStreamEvent): string {
    let lines: string[] = [];

    lines.push(`event: ${event.type}`);

    if (this.dataField === 'data') {
      const payload = JSON.stringify(event);
      const encoded = this.encodeData(payload);
      lines.push(`data: ${encoded}`);
    } else {
      lines.push(`data: ${event.content ?? ''}`);
    }

    if (this.retryMs > 0) {
      lines.push(`retry: ${this.retryMs}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private encodeData(data: string): string {
    return data.replace(/\n/g, '\ndata: ');
  }

  async writeToStream(stream: AsyncGenerator<LlmStreamEvent>, writer: { write: (chunk: string) => void; end?: () => void }): Promise<void> {
    for await (const event of stream) {
      const formatted = this.formatEvent(event);
      writer.write(formatted);

      if (event.type === 'finish' || event.type === 'error') {
        break;
      }
    }

    if (writer.end) {
      writer.end();
    }
  }
}

export interface StreamCombinerOptions {
  mergeToolCalls?: boolean;
  preserveOrder?: boolean;
}

export class StreamCombiner {
  private streams: Map<string, AsyncGenerator<LlmStreamEvent>> = new Map();
  private mergeToolCalls: boolean;
  private preserveOrder: boolean;

  constructor(options: StreamCombinerOptions = {}) {
    this.mergeToolCalls = options.mergeToolCalls ?? true;
    this.preserveOrder = options.preserveOrder ?? false;
  }

  addStream(id: string, stream: AsyncGenerator<LlmStreamEvent>): void {
    this.streams.set(id, stream);
  }

  async *combine(): AsyncGenerator<LlmStreamEvent & { streamId: string }> {
    const iterators = Array.from(this.streams.entries()).map(([id, stream]) => ({
      id,
      iterator: stream[Symbol.asyncIterator](),
    }));

    const pending = new Map(iterators.map(({ id, iterator }) => [id, iterator]));

    while (pending.size > 0) {
      const promises = Array.from(pending.entries()).map(async ([id, iterator]) => {
        const result = await iterator.next();
        return { id, result };
      });

      const results = await Promise.all(promises);

      for (const { id, result } of results) {
        if (result.done) {
          pending.delete(id);
        } else {
          yield {
            ...result.value,
            streamId: id,
          };
        }
      }
    }
  }

  clear(): void {
    this.streams.clear();
  }
}

export async function* collectStream(
  stream: AsyncGenerator<LlmStreamEvent>,
): AsyncGenerator<LlmStreamEvent> {
  for await (const event of stream) {
    yield event;
  }
}

export async function streamToText(
  stream: AsyncGenerator<LlmStreamEvent>,
): Promise<string> {
  let fullText = '';
  for await (const event of stream) {
    if (event.type === 'token' && event.content) {
      fullText += event.content;
    }
    if (event.type === 'error') {
      throw new Error(event.error || 'Stream error');
    }
  }
  return fullText;
}

export async function streamToArray(
  stream: AsyncGenerator<LlmStreamEvent>,
): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

export async function streamToBuffer(
  stream: AsyncGenerator<LlmStreamEvent>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const event of stream) {
    if (event.content) {
      chunks.push(Buffer.from(event.content, 'utf-8'));
    }
  }
  return Buffer.concat(chunks);
}

export interface StreamSplitterOptions {
  separator?: string;
  maxChunkSize?: number;
}

export class StreamSplitter {
  private separator: string;
  private maxChunkSize: number;
  private buffer: string = '';

  constructor(options: StreamSplitterOptions = {}) {
    this.separator = options.separator ?? '\n';
    this.maxChunkSize = options.maxChunkSize ?? 1024;
  }

  async *split(stream: AsyncGenerator<LlmStreamEvent>): AsyncGenerator<LlmStreamEvent> {
    for await (const event of stream) {
      if (event.type === 'token' && event.content) {
        this.buffer += event.content;

        while (this.buffer.length > 0) {
          const sepIndex = this.buffer.indexOf(this.separator);

          if (sepIndex === -1) {
            if (this.buffer.length >= this.maxChunkSize) {
              const chunk = this.buffer.slice(0, this.maxChunkSize);
              this.buffer = this.buffer.slice(this.maxChunkSize);
              yield { ...event, content: chunk };
            } else {
              break;
            }
          } else {
            const chunk = this.buffer.slice(0, sepIndex + this.separator.length);
            this.buffer = this.buffer.slice(sepIndex + this.separator.length);
            yield { ...event, content: chunk };
          }
        }
      } else {
        yield event;
      }
    }

    if (this.buffer.length > 0) {
      yield { type: 'token', content: this.buffer, timestamp: Date.now() };
      this.buffer = '';
    }
  }
}