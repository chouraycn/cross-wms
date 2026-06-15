/**
 * API Request History Data Access Object — API 请求历史数据访问层
 *
 * v3.0: 封装 api_request_history 表的写入和查询操作
 * + 自动记录每次 API 模板执行的结果
 */

import { initDb, type ApiRequestHistoryRow } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ===================== Public DAO Functions =====================

/**
 * 插入一条请求历史记录。
 */
export function insertHistory(data: {
  templateId?: string;
  url: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  isSuccess: boolean;
  extractedPreview?: string;
  error?: string;
  /** 请求头 JSON 字符串 */
  requestHeaders?: string;
  /** 请求体 */
  requestBody?: string;
  /** 响应头 JSON 字符串 */
  responseHeaders?: string;
  /** 响应体 */
  responseBody?: string;
}): void {
  const db = initDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO api_request_history (id, template_id, url, method, status_code, duration_ms, is_success, extracted_preview, error, executed_at, request_headers, request_body, response_headers, response_body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.templateId || null,
    data.url,
    data.method,
    data.statusCode,
    data.durationMs,
    data.isSuccess ? 1 : 0,
    data.extractedPreview || null,
    data.error || null,
    now,
    data.requestHeaders || '{}',
    data.requestBody || null,
    data.responseHeaders || '{}',
    data.responseBody || null,
  );
}

/**
 * 分页查询请求历史。
 */
export function listHistory(params?: {
  templateId?: string;
  page?: number;
  pageSize?: number;
}): { items: ApiRequestHistoryRow[]; total: number } {
  const db = initDb();
  const conditions: string[] = [];
  const sqlParams: unknown[] = [];

  if (params?.templateId) {
    conditions.push('template_id = ?');
    sqlParams.push(params.templateId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(Math.max(1, params?.pageSize ?? 50), 200);
  const offset = (page - 1) * pageSize;

  const countRow = db.prepare(
    `SELECT COUNT(*) as cnt FROM api_request_history ${whereClause}`
  ).get(...sqlParams) as { cnt: number };

  const items = db.prepare(
    `SELECT * FROM api_request_history ${whereClause} ORDER BY executed_at DESC LIMIT ? OFFSET ?`
  ).all(...sqlParams, pageSize, offset) as ApiRequestHistoryRow[];

  return { items, total: countRow.cnt };
}

/**
 * 获取单条请求历史详情。
 */
export function getHistory(id: string): ApiRequestHistoryRow | null {
  const db = initDb();
  return db.prepare('SELECT * FROM api_request_history WHERE id = ?').get(id) as ApiRequestHistoryRow | undefined ?? null;
}

/**
 * 删除单条请求历史。
 */
export function deleteHistory(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM api_request_history WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * 清空所有请求历史。
 * @returns 删除的行数
 */
export function clearHistory(): number {
  const db = initDb();
  const result = db.prepare('DELETE FROM api_request_history').run();
  return result.changes;
}
