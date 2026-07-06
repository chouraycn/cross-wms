/**
 * Audit Log API 客户端 — 审计日志 HTTP 调用封装
 */

import { API_BASE_URL } from '../../constants/api';

const BASE = `${API_BASE_URL}/api/audit`;

const FETCH_TIMEOUT = 10000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，请检查后端是否正常运行');
    }
    throw err;
  }
}

export type AuditAction =
  | 'message_created'
  | 'message_sent'
  | 'message_delivered'
  | 'message_read'
  | 'message_failed'
  | 'message_retry'
  | 'message_cancelled'
  | 'session_created'
  | 'session_ended'
  | 'session_archived'
  | 'content_modified'
  | 'recipient_added'
  | 'recipient_removed';

export type AuditSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface AuditEntry {
  id: string;
  timestamp: number;
  sessionKey: string;
  messageId?: string;
  action: AuditAction;
  severity: AuditSeverity;
  actor: string;
  actorType: 'user' | 'system' | 'agent' | 'plugin' | 'external';
  description: string;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  hasMore: boolean;
}

export interface AuditSummary {
  totalEntries: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  byActorType: Record<string, number>;
  firstEntryAt?: number;
  lastEntryAt?: number;
}

export async function fetchAuditLogs(params?: {
  sessionKey?: string;
  messageId?: string;
  action?: string;
  severity?: string;
  actor?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditQueryResult> {
  const searchParams = new URLSearchParams();
  if (params?.sessionKey) searchParams.set('sessionKey', params.sessionKey);
  if (params?.messageId) searchParams.set('messageId', params.messageId);
  if (params?.action) searchParams.set('action', params.action);
  if (params?.severity) searchParams.set('severity', params.severity);
  if (params?.actor) searchParams.set('actor', params.actor);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  const url = query ? `${BASE}?${query}` : BASE;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data as AuditQueryResult;
}

export async function fetchAuditSummary(): Promise<AuditSummary> {
  const res = await fetchWithTimeout(`${BASE}/summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data as AuditSummary;
}

export async function fetchSessionTimeline(sessionKey: string): Promise<AuditEntry[]> {
  const res = await fetchWithTimeout(`${BASE}/timeline/${encodeURIComponent(sessionKey)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? []) as AuditEntry[];
}

export async function exportAuditJson(): Promise<Blob> {
  const res = await fetchWithTimeout(`${BASE}/export/json`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.blob();
}

export async function exportAuditCsv(): Promise<Blob> {
  const res = await fetchWithTimeout(`${BASE}/export/csv`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.blob();
}
