/**
 * EventRecorder — 事件记录辅助模块
 *
 * 提供便捷的事件记录接口，自动处理常见的记录模式。
 * 支持：
 * - 消息事件（创建、更新、删除）
 * - 回合事件（开始、完成、失败）
 * - 工具调用事件（开始、完成、失败）
 * - 流式输出事件（开始、结束）
 * - 错误事件（系统错误）
 */

import { getEventLedger, type LedgerEvent, type EventType } from './eventLedger.js';
import { logger } from '../logger.js';

// ==================== 延迟初始化 ====================

let initialized = false;

function ensureLedger() {
  if (!initialized) {
    try {
      getEventLedger().init();
      initialized = true;
    } catch (err) {
      logger.warn('[EventRecorder] EventLedger 尚未初始化:', err);
    }
  }
  return getEventLedger();
}

// ==================== 消息事件 ====================

export async function recordMessageCreated(
  sessionId: string,
  messageId: string,
  role: 'user' | 'assistant',
  content: string,
  options?: {
    model?: string;
    toolCalls?: unknown[];
    thinking?: string;
    attachments?: unknown[];
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    const event = await getEventLedger().recordEvent(sessionId, 'message.created', {
      messageId,
      role,
      content: content.slice(0, 10000),
      model: options?.model,
      toolCalls: options?.toolCalls,
      thinking: options?.thinking,
      attachments: options?.attachments,
    }, { runId: options?.runId });

    return event;
  } catch (err) {
    logger.warn('[EventRecorder] 记录 message.created 失败:', err);
    return null;
  }
}

export async function recordMessageUpdated(
  sessionId: string,
  messageId: string,
  oldContent?: string,
  newContent?: string,
  options?: { runId?: string }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'message.updated', {
      messageId,
      oldContent: oldContent?.slice(0, 2000),
      newContent: newContent?.slice(0, 2000),
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 message.updated 失败:', err);
    return null;
  }
}

export async function recordMessageDeleted(
  sessionId: string,
  messageId: string,
  options?: { reason?: string; runId?: string }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'message.deleted', {
      messageId,
      reason: options?.reason,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 message.deleted 失败:', err);
    return null;
  }
}

// ==================== 回合事件 ====================

export async function recordTurnStarted(
  sessionId: string,
  options?: {
    userMessage?: string;
    model?: string;
    executionMode?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'turn.started', {
      userMessage: options?.userMessage?.slice(0, 500),
      model: options?.model,
      executionMode: options?.executionMode,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 turn.started 失败:', err);
    return null;
  }
}

export async function recordTurnCompleted(
  sessionId: string,
  options?: {
    assistantContent?: string;
    model?: string;
    toolCallsCount?: number;
    thinkingDuration?: number;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'turn.completed', {
      assistantContent: options?.assistantContent?.slice(0, 5000),
      model: options?.model,
      toolCallsCount: options?.toolCallsCount,
      thinkingDuration: options?.thinkingDuration,
      usage: options?.usage,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 turn.completed 失败:', err);
    return null;
  }
}

export async function recordTurnFailed(
  sessionId: string,
  error: string | Error,
  options?: {
    model?: string;
    context?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return await getEventLedger().recordEvent(sessionId, 'turn.failed', {
      error: errorMessage.slice(0, 1000),
      stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
      model: options?.model,
      context: options?.context,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 turn.failed 失败:', err);
    return null;
  }
}

// ==================== 工具调用事件 ====================

export async function recordToolCallStarted(
  sessionId: string,
  toolName: string,
  toolArgs: string | Record<string, unknown>,
  options?: {
    toolCallId?: string;
    messageId?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    const argsStr = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs);
    return await getEventLedger().recordEvent(sessionId, 'tool.call.started', {
      toolName,
      toolCallId: options?.toolCallId,
      messageId: options?.messageId,
      toolArgs: argsStr.slice(0, 2000),
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 tool.call.started 失败:', err);
    return null;
  }
}

export async function recordToolCallCompleted(
  sessionId: string,
  toolName: string,
  result: string,
  options?: {
    toolCallId?: string;
    duration?: number;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'tool.call.completed', {
      toolName,
      toolCallId: options?.toolCallId,
      result: result.slice(0, 5000),
      duration: options?.duration,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 tool.call.completed 失败:', err);
    return null;
  }
}

export async function recordToolCallFailed(
  sessionId: string,
  toolName: string,
  error: string | Error,
  options?: {
    toolCallId?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return await getEventLedger().recordEvent(sessionId, 'tool.call.failed', {
      toolName,
      toolCallId: options?.toolCallId,
      error: errorMessage.slice(0, 1000),
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 tool.call.failed 失败:', err);
    return null;
  }
}

// ==================== 流式输出事件 ====================

export async function recordModelStreamStart(
  sessionId: string,
  options?: {
    model?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'model.stream.start', {
      model: options?.model,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 model.stream.start 失败:', err);
    return null;
  }
}

export async function recordModelStreamEnd(
  sessionId: string,
  options?: {
    totalTokens?: number;
    duration?: number;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'model.stream.end', {
      totalTokens: options?.totalTokens,
      duration: options?.duration,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 model.stream.end 失败:', err);
    return null;
  }
}

// ==================== 系统事件 ====================

export async function recordSystemError(
  sessionId: string,
  error: string | Error,
  options?: {
    context?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return await getEventLedger().recordEvent(sessionId, 'system.error', {
      error: errorMessage.slice(0, 2000),
      stack: error instanceof Error ? error.stack?.slice(0, 3000) : undefined,
      context: options?.context,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 system.error 失败:', err);
    return null;
  }
}

// ==================== 会话事件 ====================

export async function recordSessionCreated(
  sessionId: string,
  options?: {
    title?: string;
    model?: string;
    cwd?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'session.created', {
      title: options?.title || '新对话',
      model: options?.model,
      cwd: options?.cwd,
      metadata: options?.metadata,
    });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 session.created 失败:', err);
    return null;
  }
}

export async function recordSessionArchived(
  sessionId: string,
  options?: {
    reason?: string;
    summary?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'session.archived', {
      reason: options?.reason,
      summary: options?.summary,
    });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 session.archived 失败:', err);
    return null;
  }
}

// ==================== 记忆事件 ====================

export async function recordMemoryAdded(
  sessionId: string,
  content: string,
  options?: {
    keywords?: string[];
    source?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'memory.added', {
      content: content.slice(0, 2000),
      keywords: options?.keywords,
      source: options?.source,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 memory.added 失败:', err);
    return null;
  }
}

export async function recordMemoryDeleted(
  sessionId: string,
  memoryId: string,
  options?: { reason?: string; runId?: string }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'memory.deleted', {
      memoryId,
      reason: options?.reason,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 memory.deleted 失败:', err);
    return null;
  }
}

// ==================== 批量记录 ====================

export async function recordBatchEvents(
  sessionId: string,
  events: Array<{
    type: EventType;
    payload: Record<string, unknown>;
    runId?: string;
  }>
): Promise<LedgerEvent[]> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvents(sessionId, events);
  } catch (err) {
    logger.warn('[EventRecorder] 批量记录事件失败:', err);
    return [];
  }
}
