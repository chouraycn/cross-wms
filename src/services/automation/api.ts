/**
 * Automation API Service — 前端 API 服务层
 *
 * 将之前 localStorage + automationEngine 的架构替换为后端 REST API 调用。
 * 所有 CRUD 操作通过 fetch 到后端 /api/automation 端点。
 */

import type {
  Automation,
  AutomationExecution,
  TriggerType,
  EventTriggerConfig,
  ExecutionPolicy,
  NotificationConfig,
} from './types';
import { getApiBaseUrl } from '../../utils/api';

/** 通用 fetch 封装 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ===================== Automation CRUD =====================

/** 获取所有自动化 */
export async function fetchAutomations(): Promise<Automation[]> {
  const result = await request<{ data: Automation[]; total: number }>('/api/automation');
  return result.data;
}

/** 创建自动化 */
export async function createAutomationApi(data: {
  name: string;
  prompt: string;
  taskType: string;
  description?: string;
  status?: string;
  scheduleType?: string;
  rrule?: string;
  scheduledAt?: string | null;
  scheduleLabel?: string;
  taskConfig?: unknown;
  validFrom?: string | null;
  validUntil?: string | null;
  triggerType?: TriggerType;
  eventTrigger?: EventTriggerConfig | null;
  webhookConfig?: Record<string, unknown> | null;
  executionPolicy?: ExecutionPolicy | null;
  notificationConfig?: NotificationConfig | null;
}): Promise<Automation> {
  return request('/api/automation', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 更新自动化 */
export async function updateAutomationApi(
  id: string,
  data: Partial<Automation>,
): Promise<Automation> {
  return request(`/api/automation/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** 删除自动化 */
export async function deleteAutomationApi(id: string): Promise<void> {
  await request(`/api/automation/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ===================== Trigger =====================

/** 手动触发执行 */
export async function triggerAutomationApi(id: string): Promise<{
  acknowledged: boolean;
  result: {
    success: boolean;
    message: string;
    steps?: unknown[];
    data?: unknown;
  };
}> {
  return request(`/api/automation/${encodeURIComponent(id)}/trigger`, { method: 'POST' });
}

// ===================== Execution History =====================

/** 获取执行历史 */
export async function fetchExecutions(
  id: string,
  limit?: number,
  offset?: number,
): Promise<{ data: AutomationExecution[]; total: number }> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const qs = params.toString();
  return request(`/api/automation/${encodeURIComponent(id)}/executions${qs ? `?${qs}` : ''}`);
}

// ===================== Webhook Config =====================

/** 获取 Webhook 配置 */
export async function fetchWebhookConfig(id: string): Promise<{
  enabled: boolean;
  hasSecret: boolean;
}> {
  return request(`/api/automation/${encodeURIComponent(id)}/webhook-config`);
}

/** 更新 Webhook 密钥 */
export async function updateWebhookConfigApi(
  id: string,
  secret: string,
): Promise<{ enabled: boolean; hasSecret: boolean }> {
  return request(`/api/automation/${encodeURIComponent(id)}/webhook-config`, {
    method: 'PUT',
    body: JSON.stringify({ secret }),
  });
}

// ===================== Global Execution History =====================

/** 获取全局执行历史（所有自动化） */
export async function fetchAllExecutions(
  limit?: number,
  offset?: number,
): Promise<{ data: AutomationExecution[]; total: number }> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const qs = params.toString();
  return request(`/api/automation/executions${qs ? `?${qs}` : ''}`);
}

// ===================== Events =====================

/** 获取可用事件列表 */
export async function fetchAvailableEvents(): Promise<{
  events: Array<{ eventName: string; label: string }>;
}> {
  return request('/api/automation/events/list');
}

/** 手动触发事件（调试用） */
export async function triggerEventApi(
  eventName: string,
  payload?: Record<string, unknown>,
): Promise<{ triggered: number; success: number; total: number }> {
  return request('/api/automation/events/trigger', {
    method: 'POST',
    body: JSON.stringify({ eventName, payload }),
  });
}

// ===================== Clear Logs =====================

/** 清空所有执行日志 */
export async function clearExecutionLogs(): Promise<{ success: boolean; deleted: number }> {
  return request('/api/automation/executions', { method: 'DELETE' });
}
