/**
 * Turn Stream Processor
 * 回合流处理器 - 将 ACP 运行时回合事件/结果流规范化为管理器可用的结果
 */

import type { AcpTurnEvent } from "./types.js";
import { AcpRuntimeError } from "./types.js";

/**
 * 可变门，用于在超时/取消竞态后抑制延迟事件
 */
export interface TurnEventGate {
  open: boolean;
}

/**
 * 回合流是否发出了用户可见输出或终端事件的摘要
 */
export interface TurnStreamOutcome {
  sawOutput: boolean;
  sawTerminalEvent: boolean;
  sawError: boolean;
  error?: AcpRuntimeError;
}

interface ConsumeTurnEventsParams {
  events: AsyncIterable<AcpTurnEvent>;
  eventGate: TurnEventGate;
  onEvent?: (event: AcpTurnEvent) => Promise<void> | void;
  onOutputEvent?: (
    event: Extract<AcpTurnEvent, { type: "text_delta" | "tool_call" }>,
  ) => Promise<void> | void;
}

/**
 * 消费 ACP 回合事件流
 */
export async function consumeTurnEvents(
  params: ConsumeTurnEventsParams,
): Promise<TurnStreamOutcome> {
  let streamError: AcpRuntimeError | null = null;
  let sawOutput = false;
  let sawTerminalEvent = false;

  try {
    for await (const event of params.events) {
      if (!params.eventGate.open) {
        continue;
      }

      if (event.type === "done") {
        sawTerminalEvent = true;
      } else if (event.type === "error") {
        sawTerminalEvent = true;
        streamError = new AcpRuntimeError(
          "ACP_TURN_FAILED",
          (event as { error: string }).error || "ACP turn failed before completion.",
        );
      } else if (event.type === "text_delta" || event.type === "tool_call") {
        sawOutput = true;
        await params.onOutputEvent?.(event as Extract<AcpTurnEvent, { type: "text_delta" | "tool_call" }>);
      }

      await params.onEvent?.(event);
    }
  } catch (error) {
    if (params.eventGate.open) {
      if (error instanceof AcpRuntimeError) {
        streamError = error;
      } else {
        streamError = new AcpRuntimeError(
          "ACP_TURN_FAILED",
          error instanceof Error ? error.message : String(error),
          error,
        );
      }
    }
  }

  if (params.eventGate.open && streamError) {
    throw streamError;
  }

  return {
    sawOutput,
    sawTerminalEvent,
    sawError: streamError !== null,
    error: streamError ?? undefined,
  };
}

/**
 * 创建事件门
 */
export function createEventGate(initialOpen = true): TurnEventGate {
  return { open: initialOpen };
}

/**
 * 关闭事件门，抑制后续事件
 */
export function closeEventGate(gate: TurnEventGate): void {
  gate.open = false;
}

/**
 * 等待队列中的事件被处理
 */
export function waitForQueuedEvents(): Promise<"pending"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("pending"), 0);
  });
}

interface MergeTurnStreamsParams {
  mainStream: AsyncIterable<AcpTurnEvent>;
  thinkingStream?: AsyncIterable<AcpTurnEvent>;
  eventGate: TurnEventGate;
}

/**
 * 合并主文本流和思考流
 * 主文本使用高优先级，思考使用低优先级
 */
export async function* mergeTurnStreams(
  params: MergeTurnStreamsParams,
): AsyncGenerator<AcpTurnEvent> {
  const { mainStream, thinkingStream, eventGate } = params;

  const mainIterator = mainStream[Symbol.asyncIterator]();
  const thinkingIterator = thinkingStream?.[Symbol.asyncIterator]();

  let mainDone = false;
  let thinkingDone = !thinkingIterator;

  while (!mainDone || !thinkingDone) {
    if (!eventGate.open) {
      break;
    }

    // 优先处理主文本流
    if (!mainDone) {
      const result = await mainIterator.next();
      if (result.done) {
        mainDone = true;
      } else if (result.value) {
        yield result.value;
        continue;
      }
    }

    // 然后处理思考流
    if (!thinkingDone && thinkingIterator) {
      const result = await thinkingIterator.next();
      if (result.done) {
        thinkingDone = true;
      } else if (result.value) {
        yield result.value;
      }
    }

    // 如果两个流都完成了，退出循环
    if (mainDone && thinkingDone) {
      break;
    }
  }
}

export interface TurnStreamBuffer {
  mainBuffer: string;
  thinkingBuffer: string;
  toolCalls: Map<string, { name: string; input: string; completed: boolean; result?: unknown }>;
}

/**
 * 创建回合流缓冲区
 */
export function createTurnStreamBuffer(): TurnStreamBuffer {
  return {
    mainBuffer: "",
    thinkingBuffer: "",
    toolCalls: new Map(),
  };
}

/**
 * 将事件应用到缓冲区
 */
export function applyEventToBuffer(
  buffer: TurnStreamBuffer,
  event: AcpTurnEvent,
): TurnStreamBuffer {
  switch (event.type) {
    case "text_delta":
      if (event.stream === "main" && event.text) {
        buffer.mainBuffer += event.text;
      } else if (event.stream === "thought" && event.text) {
        buffer.thinkingBuffer += event.text;
      }
      break;
    case "thinking_delta":
      buffer.thinkingBuffer += event.text;
      break;
    case "tool_call":
      buffer.toolCalls.set(event.id, {
        name: event.name,
        input: typeof event.input === "string" ? event.input : JSON.stringify(event.input),
        completed: false,
      });
      break;
    case "tool_call_delta":
      const existing = buffer.toolCalls.get(event.id);
      if (existing) {
        existing.input += event.inputDelta;
      }
      break;
    case "tool_result":
      const toolCall = buffer.toolCalls.get(event.id);
      if (toolCall) {
        toolCall.completed = true;
        toolCall.result = event.result;
      }
      break;
  }
  return buffer;
}

/**
 * 从缓冲区获取累积的主文本
 */
export function getBufferedMainText(buffer: TurnStreamBuffer): string {
  return buffer.mainBuffer;
}

/**
 * 从缓冲区获取累积的思考文本
 */
export function getBufferedThinkingText(buffer: TurnStreamBuffer): string {
  return buffer.thinkingBuffer;
}

interface StreamRateLimiterOptions {
  maxEventsPerSecond?: number;
  maxTextDeltaPerSecond?: number;
}

/**
 * 流速率限制器
 */
export class StreamRateLimiter {
  private readonly maxEventsPerSecond: number;
  private readonly maxTextDeltaPerSecond: number;
  private eventCount = 0;
  private textDeltaCount = 0;
  private windowStart = Date.now();

  constructor(options: StreamRateLimiterOptions = {}) {
    this.maxEventsPerSecond = options.maxEventsPerSecond ?? 1000;
    this.maxTextDeltaPerSecond = options.maxTextDeltaPerSecond ?? 100000;
  }

  /**
   * 检查是否应该限制事件
   */
  shouldThrottle(event: AcpTurnEvent): boolean {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    if (elapsed >= 1000) {
      this.eventCount = 0;
      this.textDeltaCount = 0;
      this.windowStart = now;
      return false;
    }

    this.eventCount++;
    if (this.eventCount > this.maxEventsPerSecond) {
      return true;
    }

    if (event.type === "text_delta" && event.text) {
      this.textDeltaCount += event.text.length;
      if (this.textDeltaCount > this.maxTextDeltaPerSecond) {
        return true;
      }
    }

    return false;
  }

  /**
   * 重置速率限制器
   */
  reset(): void {
    this.eventCount = 0;
    this.textDeltaCount = 0;
    this.windowStart = Date.now();
  }
}
