/**
 * Message Audit Log — 消息审计日志系统
 *
 * 记录消息会话的完整审计轨迹，支持查询、导出和合规性检查。
 */

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
  ip?: string;
  userAgent?: string;
}

export interface AuditQuery {
  sessionKey?: string;
  messageId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  actor?: string;
  actorType?: AuditEntry['actorType'];
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  hasMore: boolean;
}

export interface AuditSummary {
  totalEntries: number;
  byAction: Record<AuditAction, number>;
  bySeverity: Record<AuditSeverity, number>;
  byActorType: Record<AuditEntry['actorType'], number>;
  firstEntryAt?: number;
  lastEntryAt?: number;
}

export class MessageAuditLog {
  private entries: AuditEntry[] = [];
  private maxEntries: number;

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 10000;
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const fullEntry: AuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    this.entries.push(fullEntry);
    this.enforceRetentionLimit();

    return fullEntry;
  }

  logMessage(
    sessionKey: string,
    messageId: string,
    action: AuditAction,
    actor: string,
    description: string,
    options: {
      severity?: AuditSeverity;
      actorType?: AuditEntry['actorType'];
      metadata?: Record<string, unknown>;
    } = {},
  ): AuditEntry {
    return this.log({
      sessionKey,
      messageId,
      action,
      severity: options.severity ?? 'info',
      actor,
      actorType: options.actorType ?? 'system',
      description,
      metadata: options.metadata,
    });
  }

  logSession(
    sessionKey: string,
    action: 'session_created' | 'session_ended' | 'session_archived',
    actor: string,
    description: string,
    options: {
      severity?: AuditSeverity;
      actorType?: AuditEntry['actorType'];
      metadata?: Record<string, unknown>;
    } = {},
  ): AuditEntry {
    return this.log({
      sessionKey,
      action,
      severity: options.severity ?? 'info',
      actor,
      actorType: options.actorType ?? 'system',
      description,
      metadata: options.metadata,
    });
  }

  query(query: AuditQuery = {}): AuditQueryResult {
    let filtered = [...this.entries];

    if (query.sessionKey) {
      filtered = filtered.filter((e) => e.sessionKey === query.sessionKey);
    }
    if (query.messageId) {
      filtered = filtered.filter((e) => e.messageId === query.messageId);
    }
    if (query.action) {
      filtered = filtered.filter((e) => e.action === query.action);
    }
    if (query.severity) {
      filtered = filtered.filter((e) => e.severity === query.severity);
    }
    if (query.actor) {
      filtered = filtered.filter((e) => e.actor === query.actor);
    }
    if (query.actorType) {
      filtered = filtered.filter((e) => e.actorType === query.actorType);
    }
    if (query.startTime !== undefined) {
      filtered = filtered.filter((e) => e.timestamp >= query.startTime!);
    }
    if (query.endTime !== undefined) {
      filtered = filtered.filter((e) => e.timestamp <= query.endTime!);
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const total = filtered.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      entries: paginated,
      total,
      hasMore: offset + limit < total,
    };
  }

  getSessionTimeline(sessionKey: string): AuditEntry[] {
    return this.query({ sessionKey, limit: 1000 }).entries.reverse();
  }

  getMessageHistory(messageId: string): AuditEntry[] {
    return this.query({ messageId, limit: 1000 }).entries.reverse();
  }

  getSummary(): AuditSummary {
    const byAction: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byActorType: Record<string, number> = {};

    let firstEntryAt: number | undefined;
    let lastEntryAt: number | undefined;

    for (const entry of this.entries) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
      byActorType[entry.actorType] = (byActorType[entry.actorType] || 0) + 1;

      if (firstEntryAt === undefined || entry.timestamp < firstEntryAt) {
        firstEntryAt = entry.timestamp;
      }
      if (lastEntryAt === undefined || entry.timestamp > lastEntryAt) {
        lastEntryAt = entry.timestamp;
      }
    }

    return {
      totalEntries: this.entries.length,
      byAction: byAction as Record<AuditAction, number>,
      bySeverity: bySeverity as Record<AuditSeverity, number>,
      byActorType: byActorType as Record<AuditEntry['actorType'], number>,
      firstEntryAt,
      lastEntryAt,
    };
  }

  exportToJson(query: AuditQuery = {}): string {
    const { entries } = this.query(query);
    return JSON.stringify(entries, null, 2);
  }

  exportToCsv(query: AuditQuery = {}): string {
    const { entries } = this.query(query);
    const lines: string[] = [
      'id,timestamp,sessionKey,messageId,action,severity,actor,actorType,description',
    ];

    for (const entry of entries) {
      const metadata = entry.metadata ? JSON.stringify(entry.metadata).replace(/"/g, '""') : '';
      lines.push(
        `${entry.id},${entry.timestamp},${this.escapeCsv(entry.sessionKey)},${
          entry.messageId ? this.escapeCsv(entry.messageId) : ''
        },${entry.action},${entry.severity},${this.escapeCsv(entry.actor)},${
          entry.actorType
        },${this.escapeCsv(entry.description)}`,
      );
    }

    return lines.join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private enforceRetentionLimit(): void {
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }
}

export const messageAuditLog = new MessageAuditLog();
