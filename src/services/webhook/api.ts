/**
 * Webhook API Service — 前端 API 服务层
 *
 * 提供 Webhook 的 CRUD、测试、日志查询等功能
 */

import type {
  Webhook,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  TestWebhookRequest,
  TestWebhookResponse,
  WebhookLog,
  WebhookStats,
} from './types';
import { API_BASE_URL } from '../../constants/api';

const BASE_URL = API_BASE_URL;

/** 通用 fetch 封装 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ===================== Webhook CRUD =====================

/** 获取所有 Webhook */
export async function fetchWebhooks(): Promise<Webhook[]> {
  const result = await request<{ data: Webhook[]; total: number }>('/api/webhook');
  return result.data;
}

/** 获取单个 Webhook */
export async function fetchWebhookById(id: string): Promise<Webhook> {
  return request(`/api/webhook/${encodeURIComponent(id)}`);
}

/** 创建 Webhook */
export async function createWebhookApi(data: CreateWebhookRequest): Promise<Webhook> {
  return request('/api/webhook', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 更新 Webhook */
export async function updateWebhookApi(
  id: string,
  data: UpdateWebhookRequest,
): Promise<Webhook> {
  return request(`/api/webhook/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** 删除 Webhook */
export async function deleteWebhookApi(id: string): Promise<void> {
  await request(`/api/webhook/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 切换 Webhook 启用状态 */
export async function toggleWebhookEnabledApi(
  id: string,
  enabled: boolean,
): Promise<Webhook> {
  return request(`/api/webhook/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

// ===================== Webhook Test =====================

/** 测试 Webhook 发送 */
export async function testWebhookApi(data: TestWebhookRequest): Promise<TestWebhookResponse> {
  return request(`/api/webhook/${encodeURIComponent(data.webhookId)}/test`, {
    method: 'POST',
    body: JSON.stringify({
      eventType: data.eventType,
      payload: data.payload,
    }),
  });
}

// ===================== Webhook Logs =====================

/** 获取 Webhook 执行日志 */
export async function fetchWebhookLogs(
  webhookId: string,
  limit?: number,
): Promise<WebhookLog[]> {
  const query = limit ? `?limit=${limit}` : '';
  const result = await request<{ data: WebhookLog[]; total: number }>(
    `/api/webhook/${encodeURIComponent(webhookId)}/logs${query}`,
  );
  return result.data;
}

/** 获取所有 Webhook 日志 */
export async function fetchAllWebhookLogs(limit?: number): Promise<WebhookLog[]> {
  const query = limit ? `?limit=${limit}` : '';
  const result = await request<{ data: WebhookLog[]; total: number }>(
    `/api/webhook/logs${query}`,
  );
  return result.data;
}

// ===================== Webhook Stats =====================

/** 获取 Webhook 统计信息 */
export async function fetchWebhookStats(): Promise<WebhookStats> {
  return request('/api/webhook/stats');
}