import type { Response } from 'express';

export type StopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface TextContent {
  type: 'text';
  text: string;
  textSignature?: string;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

export interface ToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
  executionMode?: 'sequential' | 'parallel';
}

export interface AssistantMessage {
  role: 'assistant';
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  responseModel?: string;
  responseId?: string;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  errorCode?: string;
  timestamp: number;
}

export type AssistantMessageEvent =
  | { type: 'start'; partial: AssistantMessage }
  | { type: 'text_start'; contentIndex: number; partial?: AssistantMessage }
  | { type: 'text_delta'; contentIndex: number; delta: string; partial?: AssistantMessage }
  | { type: 'text_end'; contentIndex: number; content: string; partial?: AssistantMessage }
  | { type: 'thinking_start'; contentIndex: number; partial?: AssistantMessage }
  | { type: 'thinking_delta'; contentIndex: number; delta: string; partial?: AssistantMessage }
  | { type: 'thinking_end'; contentIndex: number; content: string; partial?: AssistantMessage }
  | { type: 'toolcall_start'; contentIndex: number; partial?: AssistantMessage }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string; partial?: AssistantMessage }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: ToolCall; partial?: AssistantMessage }
  | { type: 'done'; reason: Extract<StopReason, 'stop' | 'length' | 'toolUse'>; message: AssistantMessage }
  | { type: 'error'; reason: Extract<StopReason, 'aborted' | 'error'>; error: AssistantMessage };

export interface AssistantMessageEventStreamContract extends AsyncIterable<AssistantMessageEvent> {
  push(event: AssistantMessageEvent): void;
  end(result?: AssistantMessage): void;
  error(error: Error): void;
  result(): Promise<AssistantMessage>;
  isDone(): boolean;
  hasError(): boolean;
}

export class EventStream<T, R = T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiting: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;
  private finalResultPromise: Promise<R>;
  private resolveFinalResult!: (result: R) => void;
  private isComplete: (event: T) => boolean;
  private extractResult: (event: T) => R;
  private errorValue: Error | null = null;
  private rejectFinalResult: ((error: Error) => void) | null = null;

  constructor(isComplete: (event: T) => boolean, extractResult: (event: T) => R) {
    this.isComplete = isComplete;
    this.extractResult = extractResult;
    this.finalResultPromise = new Promise((resolve, reject) => {
      this.resolveFinalResult = resolve;
      this.rejectFinalResult = reject;
    });
  }

  push(event: T): void {
    if (this.done) return;
    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  /** 发送错误并终止流 */
  error(error: Error): void {
    this.done = true;
    this.errorValue = error;
    if (this.rejectFinalResult) {
      this.rejectFinalResult(error);
    }
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ value: undefined as unknown, done: true });
    }
  }

  /** 检查流是否已结束 */
  isDone(): boolean {
    return this.done;
  }

  /** 检查流是否有错误 */
  hasError(): boolean {
    return this.errorValue !== null;
  }

  end(result?: R): void {
    this.done = true;
    if (result !== undefined) {
      this.resolveFinalResult(result);
    }
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ value: undefined as unknown, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        if (this.errorValue) {
          throw this.errorValue;
        }
        return;
      } else {
        const result = await new Promise<IteratorResult<T>>((resolve) => {
          this.waiting.push(resolve);
        });
        if (result.done) {
          if (this.errorValue) {
            throw this.errorValue;
          }
          return;
        }
        yield result.value;
      }
    }
  }

  result(): Promise<R> {
    return this.finalResultPromise;
  }
}

export class AssistantMessageEventStream
  extends EventStream<AssistantMessageEvent, AssistantMessage>
  implements AssistantMessageEventStreamContract
{
  constructor() {
    super(
      (event) => event.type === 'done' || event.type === 'error',
      (event) => {
        if (event.type === 'done') {
          return event.message;
        } else if (event.type === 'error') {
          return event.error;
        }
        throw new Error('Unexpected event type for final result');
      },
    );
  }
}

export function createAssistantMessageEventStream(): AssistantMessageEventStream {
  return new AssistantMessageEventStream();
}

export async function pipeEventStreamToSSE(
  stream: AssistantMessageEventStreamContract,
  res: Response,
  sessionId?: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let seq = 0;
  // tool 事件累积状态
  let currentToolCall: {
    id: string;
    name: string;
    argsBuffer: string;
  } | null = null;

  const sendPayload = (payload: Record<string, unknown>) => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Connection closed
    }
  };

  const convertAndSend = (event: AssistantMessageEvent) => {
    seq++;
    const basePayload = { seq, runId: sessionId || '' };

    switch (event.type) {
      case 'start': {
        sendPayload({
          ...basePayload,
          stream: 'lifecycle',
          data: {
            phase: 'init',
            model: event.partial?.model || '',
            modelName: event.partial?.model || '',
          },
        });
        break;
      }

      case 'text_delta': {
        sendPayload({
          ...basePayload,
          stream: 'assistant',
          data: { content: event.delta },
        });
        break;
      }

      case 'thinking_delta': {
        sendPayload({
          ...basePayload,
          stream: 'thinking',
          data: { content: event.delta },
        });
        break;
      }

      case 'toolcall_start': {
        currentToolCall = {
          id: `tc_${Date.now()}_${seq}`,
          name: event.partial?.content?.[event.contentIndex]?.type === 'toolCall'
            ? (event.partial.content[event.contentIndex] as ToolCall).name
            : '',
          argsBuffer: '',
        };
        break;
      }

      case 'toolcall_delta': {
        if (currentToolCall) {
          currentToolCall.argsBuffer += event.delta;
        }
        break;
      }

      case 'toolcall_end': {
        const toolCall = event.toolCall;
        const finalArgs = currentToolCall?.argsBuffer && currentToolCall.argsBuffer.length > 0
          ? currentToolCall.argsBuffer
          : JSON.stringify(toolCall.arguments);
        sendPayload({
          ...basePayload,
          stream: 'tool',
          data: {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            name: toolCall.name,
            toolArgs: finalArgs,
            args: finalArgs,
            result: '',
          },
        });
        currentToolCall = null;
        break;
      }

      case 'done': {
        sendPayload({
          ...basePayload,
          stream: 'lifecycle',
          data: {
            phase: 'done',
            usage: event.message?.usage,
            thinkingDuration: 0,
          },
        });
        break;
      }

      case 'error': {
        sendPayload({
          ...basePayload,
          stream: 'error',
          data: {
            message: event.error?.errorMessage || 'Unknown error',
            error: event.error?.errorMessage || 'Unknown error',
          },
        });
        break;
      }

      default:
        break;
    }
  };

  for await (const event of stream) {
    convertAndSend(event);
    if (event.type === 'done' || event.type === 'error') {
      break;
    }
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 200));
  try {
    res.end();
  } catch {
    // Response already closed
  }
}