/**
 * Webhook API 服务
 * 封装 Webhook 的 CRUD、测试和日志查询功能
 */

import { request } from './api';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  headers: Record<string, string>;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  eventType: string;
  status: 'pending' | 'success' | 'failed';
  triggeredAt: string;
  completedAt?: string;
  requestBody: string;
  responseBody?: string;
  duration?: number;
  statusCode?: number;
  error?: string;
  retryCount: number;
}

export interface WebhookStats {
  total: number;
  successCount: number;
  failedCount: number;
}

export interface WebhookListResponse {
  ok: boolean;
  webhooks: WebhookConfig[];
}

export interface WebhookResponse {
  ok: boolean;
  webhook: WebhookConfig;
}

export interface WebhookStatsResponse {
  ok: boolean;
  stats: WebhookStats;
}

export interface WebhookLogsResponse {
  ok: boolean;
  logs: WebhookLog[];
  total: number;
}

export interface WebhookTestResponse {
  ok: boolean;
  response?: {
    status: number;
    body: string;
  };
  error?: string;
}

export async function getAllWebhooks(): Promise<WebhookConfig[]> {
  const res = await request<WebhookListResponse>('GET', '/api/webhook');
  return res.webhooks;
}

export async function getWebhookById(id: string): Promise<WebhookConfig> {
  const res = await request<WebhookResponse>('GET', `/api/webhook/${encodeURIComponent(id)}`);
  return res.webhook;
}

export async function createWebhook(data: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookConfig> {
  const res = await request<WebhookResponse>('POST', '/api/webhook', data);
  return res.webhook;
}

export async function updateWebhook(id: string, data: Partial<WebhookConfig>): Promise<WebhookConfig> {
  const res = await request<WebhookResponse>('PUT', `/api/webhook/${encodeURIComponent(id)}`, data);
  return res.webhook;
}

export async function deleteWebhook(id: string): Promise<void> {
  await request<void>('DELETE', `/api/webhook/${encodeURIComponent(id)}`);
}

export async function getWebhookStats(): Promise<WebhookStats> {
  const res = await request<WebhookStatsResponse>('GET', '/api/webhook/stats');
  return res.stats;
}

export async function testWebhook(id: string, payload?: unknown): Promise<WebhookTestResponse> {
  return request<WebhookTestResponse>('POST', `/api/webhook/${encodeURIComponent(id)}/test`, { payload });
}

export async function getWebhookLogs(id: string, limit = 50, offset = 0): Promise<{ logs: WebhookLog[]; total: number }> {
  const res = await request<WebhookLogsResponse>('GET', `/api/webhook/${encodeURIComponent(id)}/logs?limit=${limit}&offset=${offset}`);
  return { logs: res.logs, total: res.total };
}