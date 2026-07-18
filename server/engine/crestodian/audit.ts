import { randomUUID } from 'node:crypto';
export type { CrestodianAuditEntry } from './types.js';
import type {
  CrestodianAuditEntry,
  CrestodianOperationType,
  CrestodianSeverity,
} from './types.js';

const auditLog: CrestodianAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 500;

export function auditCrestodianOperation(entry: Omit<CrestodianAuditEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): CrestodianAuditEntry {
  const fullEntry: CrestodianAuditEntry = {
    id: entry.id ?? randomUUID(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    operation: entry.operation,
    status: entry.status,
    initiator: entry.initiator,
    message: entry.message,
    ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
    ...(entry.details ? { details: entry.details } : {}),
    ...(entry.error ? { error: entry.error } : {}),
  };

  auditLog.push(fullEntry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.shift();
  }

  return fullEntry;
}

export function getRecentAuditEntries(limit?: number): CrestodianAuditEntry[] {
  const entries = [...auditLog].reverse();
  if (limit && limit < entries.length) {
    return entries.slice(0, limit);
  }
  return entries;
}

export function getAuditEntriesByOperation(
  operation: CrestodianOperationType,
  limit?: number,
): CrestodianAuditEntry[] {
  const entries = auditLog.filter((e) => e.operation === operation).reverse();
  if (limit && limit < entries.length) {
    return entries.slice(0, limit);
  }
  return entries;
}

export function getAuditEntriesByStatus(
  status: CrestodianAuditEntry['status'],
  limit?: number,
): CrestodianAuditEntry[] {
  const entries = auditLog.filter((e) => e.status === status).reverse();
  if (limit && limit < entries.length) {
    return entries.slice(0, limit);
  }
  return entries;
}

export function getAuditSummary(): {
  total: number;
  byOperation: Record<string, number>;
  byStatus: Record<string, number>;
  byInitiator: Record<string, number>;
  successRate: number;
} {
  const byOperation: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byInitiator: Record<string, number> = {};
  let completed = 0;
  let total = 0;

  for (const entry of auditLog) {
    total++;
    byOperation[entry.operation] = (byOperation[entry.operation] ?? 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
    byInitiator[entry.initiator] = (byInitiator[entry.initiator] ?? 0) + 1;
    if (entry.status === 'completed') {
      completed++;
    }
  }

  return {
    total,
    byOperation,
    byStatus,
    byInitiator,
    successRate: total > 0 ? completed / total : 1,
  };
}

export function clearAuditLog(): void {
  auditLog.length = 0;
}

export function formatAuditEntry(entry: CrestodianAuditEntry): string {
  const parts: string[] = [];
  parts.push(`[${entry.timestamp}]`);
  parts.push(`[${entry.operation.toUpperCase()}]`);
  parts.push(`[${entry.status}]`);
  parts.push(`[${entry.initiator}]`);
  parts.push(entry.message);
  if (entry.durationMs !== undefined) {
    parts.push(`(${entry.durationMs}ms)`);
  }
  if (entry.error) {
    parts.push(`- ERROR: ${entry.error}`);
  }
  return parts.join(' ');
}
