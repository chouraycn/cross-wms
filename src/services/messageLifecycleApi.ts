/**
 * Message Lifecycle API — 消息生命周期管理 API
 *
 * 封装消息生命周期相关的 HTTP 调用
 */

import { request } from './api';

// ===================== Types =====================

/** 消息生命周期状态 */
export interface MessageState {
  id: string;
  status: 'pending' | 'processing' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
  phase?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
  channel?: string;
  recipient?: string;
  metadata?: Record<string, unknown>;
}

/** 生命周期统计 */
export interface LifecycleStats {
  total: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  byStatus: Record<string, number>;
  byPhase?: Record<string, number>;
}

/** 状态转换记录（审计日志） */
export interface StateTransition {
  id: string;
  messageId: string;
  fromStatus: string;
  toStatus: string;
  timestamp: number;
  reason?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

/** 重试队列统计 */
export interface RetryStats {
  size: number;
  processing: number;
  deadLetterSize: number;
  isRunning: boolean;
  processedCount: number;
  successCount: number;
  failureCount: number;
  avgProcessingTime?: number;
}

/** 重试队列项 */
export interface RetryQueueItem {
  messageId: string;
  retryCount: number;
  nextRetryAt: number;
  error?: string;
  createdAt: number;
}

/** 死信队列项 */
export interface DeadLetterItem {
  messageId: string;
  originalError: string;
  retryCount: number;
  failedAt: number;
  createdAt: number;
  state?: MessageState;
}

/** 重试队列大小信息 */
export interface RetryQueueSize {
  data: number;
  deadLetter: number;
}

/** 操作成功响应 */
export interface SuccessResponse {
  success: boolean;
  message?: string;
}

/** 清理结果 */
export interface CleanupResult {
  cleaned: number;
}

// ===================== API Functions =====================

/** 获取生命周期统计 */
export async function getLifecycleStats(): Promise<LifecycleStats> {
  return request<LifecycleStats>('GET', '/api/message-lifecycle/stats');
}

/** 获取活跃消息列表 */
export async function getActiveMessages(): Promise<MessageState[]> {
  return request<MessageState[]>('GET', '/api/message-lifecycle/active');
}

/** 获取失败消息列表 */
export async function getFailedMessages(): Promise<MessageState[]> {
  return request<MessageState[]>('GET', '/api/message-lifecycle/failed');
}

/** 获取单个消息状态详情 */
export async function getMessageState(id: string): Promise<MessageState> {
  return request<MessageState>('GET', `/api/message-lifecycle/${encodeURIComponent(id)}`);
}

/** 获取消息审计日志 */
export async function getMessageAuditLog(id: string): Promise<StateTransition[]> {
  return request<StateTransition[]>('GET', `/api/message-lifecycle/${encodeURIComponent(id)}/audit`);
}

/** 取消消息 */
export async function cancelMessage(id: string, reason?: string): Promise<MessageState> {
  return request<MessageState>('POST', `/api/message-lifecycle/${encodeURIComponent(id)}/cancel`, { reason });
}

/** 清理过期消息 */
export async function cleanupExpired(): Promise<CleanupResult> {
  return request<CleanupResult>('POST', '/api/message-lifecycle/cleanup');
}

/** 获取重试队列统计 */
export async function getRetryStats(): Promise<RetryStats> {
  return request<RetryStats>('GET', '/api/message-lifecycle/retry/stats');
}

/** 获取重试队列大小 */
export async function getRetryQueue(): Promise<RetryQueueSize> {
  return request<RetryQueueSize>('GET', '/api/message-lifecycle/retry/queue');
}

/** 获取死信队列项 */
export async function getDeadLetterItems(limit?: number): Promise<DeadLetterItem[]> {
  const query = limit ? `?limit=${limit}` : '';
  return request<DeadLetterItem[]>('GET', `/api/message-lifecycle/retry/dead-letter${query}`);
}

/** 手动处理下一个重试项 */
export async function processNextRetry(): Promise<RetryQueueItem | null> {
  return request<RetryQueueItem | null>('POST', '/api/message-lifecycle/retry/process');
}

/** 启动重试队列 */
export async function startRetryQueue(): Promise<SuccessResponse> {
  return request<SuccessResponse>('POST', '/api/message-lifecycle/retry/start');
}

/** 停止重试队列 */
export async function stopRetryQueue(): Promise<SuccessResponse> {
  return request<SuccessResponse>('POST', '/api/message-lifecycle/retry/stop');
}

/** 清空死信队列 */
export async function clearDeadLetter(): Promise<SuccessResponse> {
  return request<SuccessResponse>('DELETE', '/api/message-lifecycle/retry/dead-letter');
}