/**
 * Webhook 类型定义
 *
 * 用于管理持久化的 Webhook 配置，接收外部事件通知
 */

/** Webhook 状态 */
export type WebhookStatus = 'active' | 'inactive' | 'error';

/** Webhook 事件类型 */
export type WebhookEventType =
  | 'inventory.update'
  | 'inventory.alert'
  | 'order.created'
  | 'order.updated'
  | 'order.completed'
  | 'shipment.created'
  | 'shipment.updated'
  | 'shipment.delivered'
  | 'user.action'
  | 'system.alert'
  | 'custom';

/** Webhook 配置 */
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  status: WebhookStatus;
  secret?: string;
  description?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
  triggerCount: number;
  failureCount: number;
}

/** Webhook 创建请求 */
export interface CreateWebhookRequest {
  name: string;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  description?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

/** Webhook 更新请求 */
export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  events?: WebhookEventType[];
  secret?: string;
  description?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  status?: WebhookStatus;
}

/** Webhook 测试请求 */
export interface TestWebhookRequest {
  webhookId: string;
  eventType?: WebhookEventType;
  payload?: Record<string, unknown>;
}

/** Webhook 测试响应 */
export interface TestWebhookResponse {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  responseBody?: string;
}

/** Webhook 执行日志 */
export interface WebhookLog {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  status: 'success' | 'failed' | 'pending';
  triggeredAt: string;
  completedAt?: string;
  duration?: number;
  statusCode?: number;
  requestBody: string;
  responseBody?: string;
  error?: string;
  retryCount: number;
}

/** Webhook 统计信息 */
export interface WebhookStats {
  totalWebhooks: number;
  activeWebhooks: number;
  totalTriggers: number;
  successRate: number;
  avgResponseTime: number;
}