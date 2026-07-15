/**
 * 审批管理器 — 参考 OpenClaw gateway/exec-approval-manager.ts
 *
 * 跟踪待处理的操作符决策和短期已解决审批记录。
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';

export type ExecApprovalDecision = 'approve' | 'reject';

export interface ExecApprovalRequestPayload {
  command: string;
  nodeId?: string;
  sessionKey?: string;
  deviceId?: string;
  clientId?: string;
}

export interface ExecApprovalRecord<TPayload = ExecApprovalRequestPayload> {
  id: string;
  request: TPayload;
  createdAtMs: number;
  expiresAtMs: number;
  requestedByConnId?: string | null;
  requestedByDeviceId?: string | null;
  requestedByClientId?: string | null;
  resolvedAtMs?: number;
  decision?: ExecApprovalDecision;
  resolvedBy?: string | null;
}

interface PendingEntry<TPayload = ExecApprovalRequestPayload> {
  record: ExecApprovalRecord<TPayload>;
  resolve: (decision: ExecApprovalDecision | null) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const RESOLVED_ENTRY_GRACE_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 60_000;

export class ExecApprovalManager<TPayload = ExecApprovalRequestPayload> {
  private pending = new Map<string, PendingEntry<TPayload>>();
  private resolved = new Map<string, ExecApprovalRecord<TPayload>>();

  private scheduleResolvedEntryCleanup(id: string): void {
    setTimeout(() => {
      this.resolved.delete(id);
    }, RESOLVED_ENTRY_GRACE_MS);
  }

  create(
    request: TPayload,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    id?: string | null,
  ): ExecApprovalRecord<TPayload> {
    const now = Date.now();
    const expiresAtMs = now + timeoutMs;

    const resolvedId = id && id.trim().length > 0 ? id.trim() : randomUUID();

    const record: ExecApprovalRecord<TPayload> = {
      id: resolvedId,
      request,
      createdAtMs: now,
      expiresAtMs,
    };

    const resolveFn: (decision: ExecApprovalDecision | null) => void = () => {};
    const rejectFn: (err: Error) => void = () => {};

    const timer = setTimeout(() => {
      this.pending.delete(resolvedId);
      resolveFn(null);
      logger.warn(`[ExecApprovalManager] 审批超时: ${resolvedId}`);
    }, timeoutMs);

    this.pending.set(resolvedId, {
      record,
      resolve: resolveFn,
      reject: rejectFn,
      timer,
    });

    logger.debug(`[ExecApprovalManager] 创建审批请求: ${resolvedId}`);

    return record;
  }

  resolve(id: string, decision: ExecApprovalDecision, resolvedBy?: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }

    clearTimeout(entry.timer);

    entry.record.resolvedAtMs = Date.now();
    entry.record.decision = decision;
    entry.record.resolvedBy = resolvedBy ?? null;

    this.resolved.set(id, entry.record);
    this.scheduleResolvedEntryCleanup(id);

    entry.resolve(decision);
    this.pending.delete(id);

    logger.info(`[ExecApprovalManager] 审批已解决: ${id} → ${decision}`);

    return true;
  }

  reject(id: string, error: Error): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }

    clearTimeout(entry.timer);

    entry.record.resolvedAtMs = Date.now();

    this.resolved.set(id, entry.record);
    this.scheduleResolvedEntryCleanup(id);

    entry.reject(error);
    this.pending.delete(id);

    logger.warn(`[ExecApprovalManager] 审批被拒绝: ${id}`, error);

    return true;
  }

  get(id: string): ExecApprovalRecord<TPayload> | undefined {
    const pendingEntry = this.pending.get(id);
    if (pendingEntry) {
      return pendingEntry.record;
    }

    return this.resolved.get(id);
  }

  waitForDecision(id: string): Promise<ExecApprovalDecision | null> {
    const pendingEntry = this.pending.get(id);
    if (pendingEntry) {
      return new Promise((resolve) => {
        pendingEntry.resolve = resolve;
      });
    }

    const resolvedEntry = this.resolved.get(id);
    if (resolvedEntry && resolvedEntry.decision) {
      return Promise.resolve(resolvedEntry.decision);
    }

    return Promise.resolve(null);
  }

  hasPending(id: string): boolean {
    return this.pending.has(id);
  }

  listPending(): ExecApprovalRecord<TPayload>[] {
    return Array.from(this.pending.values()).map((entry) => entry.record);
  }

  listResolved(): ExecApprovalRecord<TPayload>[] {
    return Array.from(this.resolved.values());
  }

  cancel(id: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }

    clearTimeout(entry.timer);
    entry.resolve(null);
    this.pending.delete(id);

    logger.debug(`[ExecApprovalManager] 审批已取消: ${id}`);

    return true;
  }

  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, entry] of this.pending) {
      if (now > entry.record.expiresAtMs) {
        clearTimeout(entry.timer);
        entry.resolve(null);
        this.pending.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[ExecApprovalManager] 清理了 ${cleaned} 个过期审批`);
    }

    return cleaned;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  getResolvedCount(): number {
    return this.resolved.size;
  }

  clearAll(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    }
    this.pending.clear();
    this.resolved.clear();
    logger.info('[ExecApprovalManager] 已清除所有审批');
  }
}