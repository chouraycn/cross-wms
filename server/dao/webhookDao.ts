/**
 * Webhook 数据访问层
 *
 * 管理 webhook 配置的持久化存储
 */

import type Database from 'better-sqlite3';
import { logger } from '../logger.js';
import { getDb } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ===================== Types =====================

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[]; // JSON array of event types
  headers: Record<string, string>; // JSON object
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  eventType: string;
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

export interface WebhookStats {
  total: number;
  active: number;
  successRate: number;
}

// ===================== Table Initialization =====================

export function initWebhookTables(db: Database.Database): void {
  logger.info('[DB] 初始化 Webhook 表');

  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      headers TEXT DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      triggered_at TEXT NOT NULL,
      completed_at TEXT DEFAULT NULL,
      duration INTEGER DEFAULT NULL,
      status_code INTEGER DEFAULT NULL,
      request_body TEXT NOT NULL,
      response_body TEXT DEFAULT NULL,
      error TEXT DEFAULT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_triggered_at ON webhook_logs(triggered_at);
  `);
}

// ===================== Webhook CRUD Operations =====================

/**
 * 获取所有 Webhook
 */
export function getAllWebhooks(): WebhookConfig[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    url: row.url,
    events: JSON.parse(row.events),
    headers: JSON.parse(row.headers || '{}'),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * 根据 ID 获取单个 Webhook
 */
export function getWebhookById(id: string): WebhookConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: JSON.parse(row.events),
    headers: JSON.parse(row.headers || '{}'),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 创建 Webhook
 */
export function createWebhook(data: {
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  enabled: boolean;
}): WebhookConfig {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO webhooks (id, name, url, events, headers, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.url,
    JSON.stringify(data.events),
    JSON.stringify(data.headers || {}),
    data.enabled ? 1 : 0,
    now,
    now
  );

  return {
    id,
    name: data.name,
    url: data.url,
    events: data.events,
    headers: data.headers || {},
    enabled: data.enabled,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 更新 Webhook
 */
export function updateWebhook(
  id: string,
  data: {
    name?: string;
    url?: string;
    events?: string[];
    headers?: Record<string, string>;
    enabled?: boolean;
  }
): WebhookConfig | null {
  const db = getDb();
  const existing = getWebhookById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.url !== undefined) {
    updates.push('url = ?');
    values.push(data.url);
  }
  if (data.events !== undefined) {
    updates.push('events = ?');
    values.push(JSON.stringify(data.events));
  }
  if (data.headers !== undefined) {
    updates.push('headers = ?');
    values.push(JSON.stringify(data.headers));
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const stmt = db.prepare(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return getWebhookById(id);
}

/**
 * 删除 Webhook
 */
export function deleteWebhook(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== Webhook Logs Operations =====================

/**
 * 获取 Webhook 执行日志
 */
export function getWebhookLogs(
  webhookId: string,
  limit: number = 50,
  offset: number = 0
): { logs: WebhookLog[]; total: number } {
  const db = getDb();

  // 获取总数
  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM webhook_logs WHERE webhook_id = ?')
    .get(webhookId) as any;
  const total = countRow.count;

  // 获取日志列表
  const rows = db
    .prepare(
      'SELECT * FROM webhook_logs WHERE webhook_id = ? ORDER BY triggered_at DESC LIMIT ? OFFSET ?'
    )
    .all(webhookId, limit, offset) as any[];

  const logs: WebhookLog[] = rows.map(row => ({
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    status: row.status,
    triggeredAt: row.triggered_at,
    completedAt: row.completed_at || undefined,
    duration: row.duration || undefined,
    statusCode: row.status_code || undefined,
    requestBody: row.request_body,
    responseBody: row.response_body || undefined,
    error: row.error || undefined,
    retryCount: row.retry_count,
  }));

  return { logs, total };
}

/**
 * 创建 Webhook 日志
 */
export function createWebhookLog(log: {
  id: string;
  webhookId: string;
  eventType: string;
  status: 'success' | 'failed' | 'pending';
  triggeredAt: string;
  requestBody: string;
  retryCount: number;
}): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO webhook_logs (id, webhook_id, event_type, status, triggered_at, request_body, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    log.id,
    log.webhookId,
    log.eventType,
    log.status,
    log.triggeredAt,
    log.requestBody,
    log.retryCount
  );
}

/**
 * 更新 Webhook 日志
 */
export function updateWebhookLog(
  id: string,
  data: {
    status?: 'success' | 'failed' | 'pending';
    completedAt?: string;
    duration?: number;
    statusCode?: number;
    responseBody?: string;
    error?: string;
  }
): void {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }
  if (data.completedAt !== undefined) {
    updates.push('completed_at = ?');
    values.push(data.completedAt);
  }
  if (data.duration !== undefined) {
    updates.push('duration = ?');
    values.push(data.duration);
  }
  if (data.statusCode !== undefined) {
    updates.push('status_code = ?');
    values.push(data.statusCode);
  }
  if (data.responseBody !== undefined) {
    updates.push('response_body = ?');
    values.push(data.responseBody);
  }
  if (data.error !== undefined) {
    updates.push('error = ?');
    values.push(data.error);
  }

  if (updates.length === 0) return;

  values.push(id);
  const stmt = db.prepare(`UPDATE webhook_logs SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

// ===================== Statistics =====================

/**
 * 获取 Webhook 统计信息
 */
export function getWebhookStats(): WebhookStats {
  const db = getDb();

  // 总数
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM webhooks').get() as any;
  const total = totalRow.count;

  // 启用数量
  const activeRow = db.prepare('SELECT COUNT(*) as count FROM webhooks WHERE enabled = 1').get() as any;
  const active = activeRow.count;

  // 成功率
  const successRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM webhook_logs WHERE status = 'success'"
    )
    .get() as any;
  const successCount = successRow.count;

  const totalLogsRow = db.prepare('SELECT COUNT(*) as count FROM webhook_logs').get() as any;
  const totalLogs = totalLogsRow.count;

  const successRate = totalLogs > 0 ? (successCount / totalLogs) * 100 : 0;

  return {
    total,
    active,
    successRate: Math.round(successRate * 100) / 100, // 保留两位小数
  };
}