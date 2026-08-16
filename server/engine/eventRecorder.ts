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
    toolCalls?: any[];
    thinking?: string;
    attachments?: any[];
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
    /** 系统提示词构建版本戳（bump 于 buildApiMessages.SYSTEM_PROMPT_VERSION） */
    systemPromptVersion?: string;
    /** 该回合模型可见的工具 schema 数量 */
    toolSchemaCount?: number;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'turn.started', {
      userMessage: options?.userMessage?.slice(0, 500),
      model: options?.model,
      executionMode: options?.executionMode,
      systemPromptVersion: options?.systemPromptVersion,
      toolSchemaCount: options?.toolSchemaCount,
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
  toolArgs: string | Record<string, any>,
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

// ==================== 渠道投递事件（P1a：渠道审计可按 step 关联） ====================

/**
 * 记录一次 IM 渠道投递（企业微信/公众号/飞书）。
 * 与 sd_channel_deliveries 投递日志互补：账本事件可按会话 step 关联回放，
 * 回答"这个回合的答复有没有推出去、渠道侧状态是什么"。
 */
export async function recordChannelDelivered(
  sessionId: string,
  options?: {
    deliveryId?: string;
    channel?: string;
    tenantId?: string;
    agentId?: string;
    status?: string;
    externalId?: string;
    error?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'channel.delivered', {
      deliveryId: options?.deliveryId,
      channel: options?.channel,
      tenantId: options?.tenantId,
      agentId: options?.agentId,
      status: options?.status,
      externalId: options?.externalId,
      error: options?.error,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 channel.delivered 失败:', err);
    return null;
  }
}

// ==================== 员工派活事件（P2b：派活有归属、可审计） ====================

/**
 * 记录一次员工派活变更（创建/完成/失败/阻塞）。
 * 关联到父会话账本，与 step 时间线同源可回放。
 */
export async function recordDelegationChanged(
  sessionId: string,
  options?: {
    delegationId?: string;
    tenantId?: string;
    parentAgentId?: string;
    childAgentId?: string;
    depth?: number;
    status?: string;
    error?: string;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'delegation.change', {
      delegationId: options?.delegationId,
      tenantId: options?.tenantId,
      parentAgentId: options?.parentAgentId,
      childAgentId: options?.childAgentId,
      depth: options?.depth,
      status: options?.status,
      error: options?.error,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 delegation.change 失败:', err);
    return null;
  }
}

// ==================== 上下文压缩事件 ====================

/**
 * 记录一次上下文压缩（LLM 摘要落库）。
 * 目的：压缩之后"模型实际看到的历史"由哪些原始消息 + 哪份摘要构成可还原（G3）。
 */
export async function recordContextCompacted(
  sessionId: string,
  options?: {
    /** LLM 生成的摘要全文 */
    summary?: string;
    /** 被压缩（丢弃）的原始消息条数 */
    compressedMessageCount?: number;
    /** 压缩后保留的消息条数 */
    retainedMessageCount?: number;
    /** 触发原因：token_overflow | message_count */
    reason?: string;
    /** 压缩前估算 token */
    tokensBefore?: number;
    /** 压缩后估算 token */
    tokensAfter?: number;
    /** 压缩后是否又降级为简单截断 */
    truncated?: boolean;
    runId?: string;
  }
): Promise<LedgerEvent | null> {
  try {
    ensureLedger();
    return await getEventLedger().recordEvent(sessionId, 'context.compacted', {
      summary: options?.summary?.slice(0, 20000),
      compressedMessageCount: options?.compressedMessageCount,
      retainedMessageCount: options?.retainedMessageCount,
      reason: options?.reason,
      tokensBefore: options?.tokensBefore,
      tokensAfter: options?.tokensAfter,
      truncated: options?.truncated,
    }, { runId: options?.runId });
  } catch (err) {
    logger.warn('[EventRecorder] 记录 context.compacted 失败:', err);
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
    metadata?: Record<string, any>;
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
    payload: Record<string, any>;
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
