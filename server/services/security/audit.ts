import { logger } from '../../logger.js';
import { getDb } from '../../db-core.js';
import { nanoid } from 'nanoid';

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  success: boolean;
}

export interface AuditQueryParams {
  userId?: string;
  action?: string;
  resource?: string;
  success?: boolean;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditQueryResult {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'api_key_created'
  | 'api_key_deleted'
  | 'api_key_updated'
  | 'model_config_created'
  | 'model_config_deleted'
  | 'model_config_updated'
  | 'plugin_installed'
  | 'plugin_uninstalled'
  | 'plugin_updated'
  | 'message_sent'
  | 'message_received'
  | 'file_uploaded'
  | 'file_downloaded'
  | 'file_deleted'
  | 'system_setting_changed'
  | 'channel_config_changed'
  | 'session_created'
  | 'session_deleted'
  | 'memory_saved';

export type AuditResource =
  | 'auth'
  | 'api_key'
  | 'model'
  | 'plugin'
  | 'message'
  | 'file'
  | 'system'
  | 'channel'
  | 'session'
  | 'memory';

function initAuditTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT DEFAULT '',
      details TEXT DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      success INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_success ON audit_logs(success);
  `);
}

// 审计表在首次使用时惰性初始化，避免在 CLI 等非服务器进程导入本模块时强制初始化数据库
let auditTableInitialized = false;
function ensureAuditTable(): void {
  if (auditTableInitialized) return;
  try {
    initAuditTable();
    auditTableInitialized = true;
  } catch (e) {
    logger.warn('[Audit] 审计表初始化失败（数据库可能不可用）:', e instanceof Error ? e.message : String(e));
  }
}

export function logAudit(
  userId: string,
  action: AuditAction,
  resource: AuditResource,
  resourceId: string,
  details: Record<string, unknown> = {},
  ipAddress: string = '',
  userAgent: string = '',
  success: boolean = true,
): void {
  const id = nanoid();
  const now = new Date().toISOString();

  ensureAuditTable();
  getDb().prepare(`
    INSERT INTO audit_logs (id, user_id, action, resource, resource_id, details, ip_address, user_agent, timestamp, success)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, action, resource, resourceId, JSON.stringify(details), ipAddress, userAgent, now, success ? 1 : 0);

  const status = success ? 'SUCCESS' : 'FAILED';
  logger.info(`[Audit] ${status} - ${userId} ${action} ${resource}/${resourceId}`);
}

export function queryAuditLogs(params: AuditQueryParams): AuditQueryResult {
  const {
    userId,
    action,
    resource,
    success,
    startTime,
    endTime,
    page = 1,
    pageSize = 50,
  } = params;

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const paramsArray: unknown[] = [];

  if (userId) {
    query += ' AND user_id = ?';
    paramsArray.push(userId);
  }

  if (action) {
    query += ' AND action = ?';
    paramsArray.push(action);
  }

  if (resource) {
    query += ' AND resource = ?';
    paramsArray.push(resource);
  }

  if (success !== undefined) {
    query += ' AND success = ?';
    paramsArray.push(success ? 1 : 0);
  }

  if (startTime) {
    query += ' AND timestamp >= ?';
    paramsArray.push(startTime);
  }

  if (endTime) {
    query += ' AND timestamp <= ?';
    paramsArray.push(endTime);
  }

  query += ' ORDER BY timestamp DESC';

  const totalQuery = query.replace('SELECT *', 'SELECT COUNT(*) as cnt');
  const totalResult = getDb().prepare(totalQuery).get(...paramsArray) as { cnt: number };
  const total = totalResult.cnt;

  const offset = (page - 1) * pageSize;
  query += ' LIMIT ? OFFSET ?';
  paramsArray.push(pageSize, offset);

  const rows = getDb().prepare(query).all(...paramsArray) as Array<{
    id: string;
    user_id: string;
    action: string;
    resource: string;
    resource_id: string;
    details: string;
    ip_address: string;
    user_agent: string;
    timestamp: string;
    success: number;
  }>;

  const logs: AuditLog[] = rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    action: row.action as AuditAction,
    resource: row.resource as AuditResource,
    resourceId: row.resource_id,
    details: JSON.parse(row.details || '{}'),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    timestamp: row.timestamp,
    success: row.success === 1,
  }));

  return { logs, total, page, pageSize };
}

export function getAuditSummary(startTime?: string): {
  totalActions: number;
  successRate: number;
  topActions: Array<{ action: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
} {
  let baseQuery = 'SELECT * FROM audit_logs';
  const params: unknown[] = [];

  if (startTime) {
    baseQuery += ' WHERE timestamp >= ?';
    params.push(startTime);
  }

  ensureAuditTable();
  const totalResult = getDb().prepare(`SELECT COUNT(*) as cnt FROM audit_logs ${startTime ? 'WHERE timestamp >= ?' : ''}`).get(...params) as { cnt: number };
  const totalActions = totalResult.cnt;

  const successResult = getDb().prepare(`SELECT COUNT(*) as cnt FROM audit_logs WHERE success = 1 ${startTime ? 'AND timestamp >= ?' : ''}`).get(...params) as { cnt: number };
  const successRate = totalActions > 0 ? (successResult.cnt / totalActions) * 100 : 0;

  const topActions = getDb().prepare(`SELECT action, COUNT(*) as cnt FROM audit_logs ${startTime ? 'WHERE timestamp >= ?' : ''} GROUP BY action ORDER BY cnt DESC LIMIT 5`).all(...params) as Array<{ action: string; cnt: number }>;

  const topResources = getDb().prepare(`SELECT resource, COUNT(*) as cnt FROM audit_logs ${startTime ? 'WHERE timestamp >= ?' : ''} GROUP BY resource ORDER BY cnt DESC LIMIT 5`).all(...params) as Array<{ resource: string; cnt: number }>;

  return {
    totalActions,
    successRate: Math.round(successRate * 100) / 100,
    topActions: topActions.map(a => ({ action: a.action, count: a.cnt })),
    topResources: topResources.map(r => ({ resource: r.resource, count: r.cnt })),
  };
}

export function deleteOldLogs(daysToKeep: number = 90): number {
  ensureAuditTable();
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb().prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoffDate);
  logger.info(`[Audit] 删除了 ${result.changes} 条过期审计日志`);
  return result.changes;
}