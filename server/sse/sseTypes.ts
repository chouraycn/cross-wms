/**
 * SSE 事件类型定义 — 统一事件类型系统
 *
 * 将原有 24 种 SSE 事件精简为 8 种核心事件：
 * 1. init — 初始化元数据
 * 2. text — 文本内容流式输出
 * 3. thinking — 深度思考内容
 * 4. tool_call — 工具调用通知
 * 5. error — 后端错误通知（确保前端能收到，避免卡在"思考中"）
 * 6. done — 流结束信号
 * 7. debug — 可选调试事件（合并原 ReAct 内部事件，通过 LOG_DEBUG=1 启用）
 *
 * 向后兼容：旧事件类型通过 sendDebugSSE 发送，前端仍能接收但不在 UI 上展示。
 */

import type { Response } from 'express';

// ===================== 核心事件类型 =====================

/** init 事件 — 初始化元数据 */
export interface SSEInitEvent {
  type: 'init';
  sessionId: string;
  assistantMessageId: string;
  model: string;
  modelName: string;
  autoReason?: string;
  autoReasonType?: string;
  preset?: { id: string; label: string } | null;
}

/** text 事件 — 文本内容流式输出 */
export interface SSETextEvent {
  type: 'text';
  content: string;
}

/** thinking 事件 — 深度思考内容 */
export interface SSEThinkingEvent {
  type: 'thinking';
  content: string;
}

/** tool_call 事件 — 工具调用通知 */
export interface SSEToolCallEvent {
  type: 'tool_call';
  toolCallId?: string;
  toolName?: string;
  tool?: string;
  toolArgs?: string;
  args?: string;
  result?: string;
  id?: string;
}

/** error 事件 — 后端错误通知（确保前端能收到，避免卡在"思考中"） */
export interface SSEErrorEvent {
  type: 'error';
  /** 错误代码（如 AUTH_FAILED, RATE_LIMITED, SERVER_ERROR 等） */
  code: string;
  /** 用户友好的错误消息 */
  message: string;
}

/** done 事件 — 流结束信号 */
export interface SSEDoneEvent {
  type: 'done';
  errorCode: string | null;
  errorMessage: string | null;
  thinkingDuration?: number;
  usage?: { promptTokens?: number; completionTokens?: number; thinkingTokens?: number; totalTokens?: number } | null;
  fallbackModel?: string;
  fallbackReason?: string;
}

/** debug 事件 — 可选调试事件（合并原 ReAct 内部事件） */
export interface SSEDebugEvent {
  type: string; // 原始事件类型（如 react_phase, complexity_assessment 等）
  [key: string]: unknown;
}

// ===================== 联合类型 =====================

/** 7 种核心 SSE 事件联合类型 */
export type SSEEvent =
  | SSEInitEvent
  | SSETextEvent
  | SSEThinkingEvent
  | SSEToolCallEvent
  | SSEErrorEvent
  | SSEDoneEvent
  | SSEDebugEvent;

// ===================== 核心事件类型集合 =====================

/** 7 种核心事件类型字面量 */
export const CORE_EVENT_TYPES = [
  'init',
  'text',
  'thinking',
  'tool_call',
  'error',
  'done',
  'debug',
] as const;

/** 核心事件类型 */
export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

/**
 * 判断事件类型是否属于核心 8 种。
 * 非核心事件类型需要通过 sendDebugSSE 发送。
 */
export function isCoreEventType(type: string): boolean {
  return (CORE_EVENT_TYPES as readonly string[]).includes(type);
}

// ===================== 辅助函数 =====================

/**
 * 安全写入 SSE 数据 — 内置 writableEnded 检查 + try-catch
 *
 * 所有 SSE 写入必须使用此函数，禁止裸 res.write()。
 */
export function sendSSE(res: Response, event: Record<string, unknown>): void {
  if (!res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // 连接已断开，忽略写入异常
    }
  }
}

/**
 * 发送调试事件 — 检查 LOG_DEBUG 环境变量
 *
 * 非核心事件类型（如 react_phase, complexity_assessment, keep_alive 等）
 * 统一通过此函数发送。仅当 LOG_DEBUG=1 时实际写入。
 *
 * 向后兼容：即使 LOG_DEBUG 未开启，也不影响调用方逻辑（静默跳过）。
 */
export function sendDebugSSE(res: Response, event: Record<string, unknown>): void {
  // LOG_DEBUG=1 时发送调试事件，否则静默跳过
  if (process.env.LOG_DEBUG !== '1') return;
  if (!res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify({ ...event, _channel: 'debug' })}\n\n`);
    } catch {
      // 连接已断开，忽略写入异常
    }
  }
}

/**
 * 发送 done 事件并结束响应流
 *
 * 统一封装 done 事件发送 + res.end()，包含 200ms 延迟确保前端接收。
 */
export async function sendDoneAndEnd(
  res: Response,
  options: {
    errorCode?: string | null;
    errorMessage?: string | null;
    thinkingDuration?: number;
    usage?: unknown;
    fallbackModel?: string;
    fallbackReason?: string;
  } = {},
): Promise<void> {
  sendSSE(res, {
    type: 'done',
    errorCode: options.errorCode ?? null,
    errorMessage: options.errorMessage ?? null,
    thinkingDuration: options.thinkingDuration ?? 0,
    usage: options.usage ?? null,
    ...(options.fallbackModel ? { fallbackModel: options.fallbackModel } : {}),
    ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {}),
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 200));
  try {
    res.end();
  } catch {
    // 响应流可能已关闭，忽略
  }
}
