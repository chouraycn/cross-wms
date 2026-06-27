/**
 * Turn Results
 * 回合结果处理器 - 处理和规范化回合执行结果
 */

import type {
  AcpTurnEvent,
  TurnResult,
  ContentBlock,
  ToolCall,
  ToolResult,
} from "./types.js";
import { AcpRuntimeError } from "./types.js";

export interface ProcessedTurnResult {
  content: string;
  thinkingText: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: string;
    result?: unknown;
    isError?: boolean;
  }>;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  contentBlocks: ContentBlock[];
  rawEvents: AcpTurnEvent[];
  durationMs: number;
  startedAt: number;
  completedAt: number;
}

export interface TurnResultAccumulator {
  textBuffer: string;
  thinkingBuffer: string;
  toolCalls: Map<string, {
    name: string;
    input: string;
    completed: boolean;
    result?: unknown;
    isError?: boolean;
  }>;
  contentBlocks: ContentBlock[];
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  finishReason: string;
  eventCount: number;
  startedAt: number;
}

/**
 * 创建回合结果累加器
 */
export function createTurnResultAccumulator(startedAt?: number): TurnResultAccumulator {
  return {
    textBuffer: "",
    thinkingBuffer: "",
    toolCalls: new Map(),
    contentBlocks: [],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
    },
    finishReason: "unknown",
    eventCount: 0,
    startedAt: startedAt ?? Date.now(),
  };
}

/**
 * 将事件应用到累加器
 */
export function applyEventToAccumulator(
  acc: TurnResultAccumulator,
  event: AcpTurnEvent,
): TurnResultAccumulator {
  acc.eventCount++;

  switch (event.type) {
    case "text_delta":
      if (event.stream === "thought") {
        acc.thinkingBuffer += event.text;
      } else {
        acc.textBuffer += event.text;
      }
      break;

    case "thinking_delta":
      acc.thinkingBuffer += event.text;
      break;

    case "tool_call":
      acc.toolCalls.set(event.id, {
        name: event.name,
        input: typeof event.input === "string" ? event.input : JSON.stringify(event.input),
        completed: false,
      });
      break;

    case "tool_call_delta":
      const existing = acc.toolCalls.get(event.id);
      if (existing) {
        existing.input += event.inputDelta;
      }
      break;

    case "tool_result":
      const toolCall = acc.toolCalls.get(event.id);
      if (toolCall) {
        toolCall.completed = true;
        toolCall.result = event.result;
        toolCall.isError = event.isError;
      }
      break;

    case "content_block":
      acc.contentBlocks.push(event.block);
      break;

    case "done":
      acc.finishReason = event.finishReason ?? "stop";
      if (event.usage) {
        acc.usage = {
          ...acc.usage,
          ...event.usage,
        };
      }
      break;

    case "error":
      acc.finishReason = "error";
      break;
  }

  return acc;
}

/**
 * 从累加器生成最终结果
 */
export function finalizeTurnResult(
  acc: TurnResultAccumulator,
  completedAt?: number,
): ProcessedTurnResult {
  const endTime = completedAt ?? Date.now();
  const durationMs = endTime - acc.startedAt;

  const toolCalls = Array.from(acc.toolCalls.entries()).map(([id, call]) => ({
    id,
    name: call.name,
    input: call.input,
    result: call.result,
    isError: call.isError,
  }));

  const totalTokens = acc.usage.promptTokens + acc.usage.completionTokens;

  return {
    content: acc.textBuffer,
    thinkingText: acc.thinkingBuffer,
    toolCalls,
    finishReason: acc.finishReason,
    usage: {
      promptTokens: acc.usage.promptTokens,
      completionTokens: acc.usage.completionTokens,
      totalTokens: totalTokens,
    },
    contentBlocks: acc.contentBlocks,
    rawEvents: [],
    durationMs,
    startedAt: acc.startedAt,
    completedAt: endTime,
  };
}

/**
 * 从事件流处理完整回合结果
 */
export async function processTurnEvents(
  events: AsyncIterable<AcpTurnEvent>,
  startedAt?: number,
): Promise<ProcessedTurnResult> {
  const acc = createTurnResultAccumulator(startedAt);
  const rawEvents: AcpTurnEvent[] = [];

  for await (const event of events) {
    rawEvents.push(event);
    applyEventToAccumulator(acc, event);
  }

  const result = finalizeTurnResult(acc);
  result.rawEvents = rawEvents;

  return result;
}

/**
 * 规范化回合结果（从 TurnResult 转换为 ProcessedTurnResult）
 */
export function normalizeTurnResult(result: TurnResult): ProcessedTurnResult {
  const toolCalls: ProcessedTurnResult["toolCalls"] = [];

  if (result.toolCalls) {
    for (const tc of result.toolCalls) {
      toolCalls.push({
        id: tc.id,
        name: tc.name,
        input: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
      });
    }
  }

  if (result.toolResults) {
    for (const tr of result.toolResults) {
      const existing = toolCalls.find((tc) => tc.id === tr.id);
      if (existing) {
        existing.result = tr.result;
        existing.isError = tr.isError;
      } else {
        toolCalls.push({
          id: tr.id,
          name: "unknown",
          input: "",
          result: tr.result,
          isError: tr.isError,
        });
      }
    }
  }

  return {
    content: result.content ?? "",
    thinkingText: result.thinkingText ?? "",
    toolCalls,
    finishReason: result.finishReason ?? "stop",
    usage: result.usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    contentBlocks: result.contentBlocks ?? [],
    rawEvents: [],
    durationMs: result.durationMs ?? 0,
    startedAt: result.startedAt ?? 0,
    completedAt: result.completedAt ?? 0,
  };
}

/**
 * 验证回合结果是否有效
 */
export function validateTurnResult(result: ProcessedTurnResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!result.content && result.toolCalls.length === 0) {
    errors.push("No content or tool calls in result");
  }

  if (result.finishReason === "error" && !result.toolCalls.some((tc) => tc.isError)) {
    // 这可能是正常的（比如 LLM 出错了）
  }

  for (const tc of result.toolCalls) {
    if (!tc.id) {
      errors.push("Tool call missing id");
    }
    if (!tc.name) {
      errors.push("Tool call missing name");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 提取回合结果摘要
 */
export function summarizeTurnResult(result: ProcessedTurnResult): string {
  const parts: string[] = [];

  if (result.content) {
    const preview = result.content.slice(0, 100);
    parts.push(`Text: ${preview}${result.content.length > 100 ? "..." : ""}`);
  }

  if (result.toolCalls.length > 0) {
    const toolNames = result.toolCalls.map((tc) => tc.name).join(", ");
    parts.push(`Tools (${result.toolCalls.length}): ${toolNames}`);
  }

  parts.push(`Finish: ${result.finishReason}`);
  parts.push(`Duration: ${result.durationMs}ms`);

  if (result.usage.totalTokens > 0) {
    parts.push(`Tokens: ${result.usage.totalTokens}`);
  }

  return parts.join(" | ");
}

/**
 * 将回合结果转换为可存储格式
 */
export function turnResultToStorable(result: ProcessedTurnResult): Record<string, unknown> {
  return {
    content: result.content,
    thinkingText: result.thinkingText,
    toolCalls: result.toolCalls,
    finishReason: result.finishReason,
    usage: result.usage,
    contentBlocks: result.contentBlocks,
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  };
}

/**
 * 从存储格式恢复回合结果
 */
export function turnResultFromStored(data: Record<string, unknown>): ProcessedTurnResult {
  return {
    content: (data.content as string) ?? "",
    thinkingText: (data.thinkingText as string) ?? "",
    toolCalls: (data.toolCalls as ProcessedTurnResult["toolCalls"]) ?? [],
    finishReason: (data.finishReason as string) ?? "unknown",
    usage:
      (data.usage as ProcessedTurnResult["usage"]) ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    contentBlocks: (data.contentBlocks as ContentBlock[]) ?? [],
    rawEvents: [],
    durationMs: (data.durationMs as number) ?? 0,
    startedAt: (data.startedAt as number) ?? 0,
    completedAt: (data.completedAt as number) ?? 0,
  };
}
