/**
 * Chat Gateway Methods — 参考 OpenClaw gateway/server-methods/chat.ts
 *
 * 实现 chat.send/history/abort/inject 等核心聊天功能。
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';
import { createSession, getSession, deleteSession, listSessions } from './sessionManager.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSendParams {
  sessionId?: string;
  sessionKey?: string;
  message: string;
  agentId?: string;
  model?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatHistoryParams {
  sessionId: string;
  limit?: number;
  offset?: number;
}

export interface ChatAbortParams {
  sessionId: string;
  runId?: string;
}

export interface ChatInjectParams {
  sessionId: string;
  message: ChatMessage;
}

export interface ChatSendResult {
  sessionId: string;
  messageId: string;
  status: 'pending' | 'streaming' | 'completed';
}

export interface ChatHistoryResult {
  messages: ChatMessage[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChatAbortResult {
  success: boolean;
  message?: string;
}

export interface ChatInjectResult {
  success: boolean;
  messageId: string;
}

export async function chatSend(params: ChatSendParams): Promise<ChatSendResult> {
  logger.info(`[Chat] 发送消息: sessionId=${params.sessionId}, message=${params.message.substring(0, 50)}...`);

  let sessionId = params.sessionId;
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    createSession(sessionId, params.sessionKey ?? 'default');
  }

  const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  await publishEvent('chat:message_created', {
    sessionId,
    messageId,
    content: params.message,
    role: 'user' as const,
  });

  return {
    sessionId,
    messageId,
    status: 'streaming',
  };
}

export async function chatHistory(params: ChatHistoryParams): Promise<ChatHistoryResult> {
  logger.info(`[Chat] 获取历史: sessionId=${params.sessionId}`);

  const session = getSession(params.sessionId);
  if (!session) {
    return { messages: [], total: 0, limit: params.limit ?? 50, offset: params.offset ?? 0 };
  }

  const messages: ChatMessage[] = [];
  return {
    messages,
    total: 0,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };
}

export async function chatAbort(params: ChatAbortParams): Promise<ChatAbortResult> {
  logger.info(`[Chat] 中止会话: sessionId=${params.sessionId}`);

  const session = getSession(params.sessionId);
  if (!session) {
    return { success: false, message: '会话不存在' };
  }

  await publishEvent('chat:session_updated', {
    sessionId: params.sessionId,
    status: 'aborted',
  });

  return { success: true };
}

export async function chatInject(params: ChatInjectParams): Promise<ChatInjectResult> {
  logger.info(`[Chat] 注入消息: sessionId=${params.sessionId}`);

  const session = getSession(params.sessionId);
  if (!session) {
    createSession(params.sessionId, 'injected');
  }

  const messageId = params.message.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  await publishEvent('chat:message_created', {
    sessionId: params.sessionId,
    messageId,
    content: params.message.content,
    role: params.message.role,
  });

  return { success: true, messageId };
}

export async function chatDelete(sessionId: string): Promise<{ success: boolean }> {
  logger.info(`[Chat] 删除会话: sessionId=${sessionId}`);

  deleteSession(sessionId);

  await publishEvent('chat:session_deleted', { sessionId });

  return { success: true };
}

export async function chatList(): Promise<{ sessions: { id: string; status: string }[] }> {
  const sessions = listSessions();
  return {
    sessions: sessions.map((s) => ({ id: s.id, status: s.status })),
  };
}