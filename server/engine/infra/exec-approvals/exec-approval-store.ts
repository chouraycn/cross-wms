import { randomUUID } from 'node:crypto';
import { logger } from '../../../logger.js';
import type { ExecApproval, ExecApprovalRequest, ApprovalStatus, ApprovalLevel } from './types.js';

export type ApprovalStoreOptions = {
  ttlMs?: number;
  maxSize?: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SIZE = 1000;

export class ExecApprovalStore {
  private approvals = new Map<string, ExecApproval>();
  private ttlMs: number;
  private maxSize: number;

  constructor(options: ApprovalStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  }

  create(request: ExecApprovalRequest, level: ApprovalLevel = 'once'): ExecApproval {
    this.evictExpired();
    
    if (this.approvals.size >= this.maxSize) {
      const oldestKey = this.approvals.keys().next().value;
      if (oldestKey) {
        this.approvals.delete(oldestKey);
      }
    }

    const now = Date.now();
    const approval: ExecApproval = {
      id: randomUUID(),
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      status: 'pending',
      level,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      requester: request.requester,
      reason: request.reason,
    };

    this.approvals.set(approval.id, approval);
    logger.debug(`[ApprovalStore] Created approval ${approval.id} for ${request.command}`);
    
    return approval;
  }

  get(id: string): ExecApproval | undefined {
    this.evictExpired();
    const approval = this.approvals.get(id);
    if (approval && approval.expiresAt && approval.expiresAt < Date.now()) {
      approval.status = 'expired';
    }
    return approval;
  }

  approve(id: string, approver?: string, reason?: string): ExecApproval | undefined {
    const approval = this.get(id);
    if (!approval) return undefined;
    
    approval.status = 'approved';
    approval.approvedAt = Date.now();
    approval.approver = approver;
    approval.reason = reason ?? approval.reason;
    
    logger.info(`[ApprovalStore] Approved ${id} by ${approver ?? 'unknown'}`);
    return approval;
  }

  reject(id: string, approver?: string, reason?: string): ExecApproval | undefined {
    const approval = this.get(id);
    if (!approval) return undefined;
    
    approval.status = 'rejected';
    approval.rejectedAt = Date.now();
    approval.approver = approver;
    approval.reason = reason ?? approval.reason;
    
    logger.info(`[ApprovalStore] Rejected ${id} by ${approver ?? 'unknown'}`);
    return approval;
  }

  list(limit = 50, offset = 0): ExecApproval[] {
    this.evictExpired();
    const all = Array.from(this.approvals.values()).sort((a, b) => b.createdAt - a.createdAt);
    return all.slice(offset, offset + limit);
  }

  findByCommand(command: string, args: string[]): ExecApproval | undefined {
    this.evictExpired();
    const argsStr = args.join(' ');
    
    for (const approval of this.approvals.values()) {
      if (approval.status === 'approved' && 
          approval.command === command &&
          approval.args.join(' ') === argsStr) {
        return approval;
      }
    }
    return undefined;
  }

  isApproved(command: string, args: string[]): boolean {
    const approval = this.findByCommand(command, args);
    return approval?.status === 'approved';
  }

  clear(): void {
    this.approvals.clear();
    logger.debug('[ApprovalStore] Cleared all approvals');
  }

  get size(): number {
    this.evictExpired();
    return this.approvals.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [id, approval] of this.approvals) {
      if (approval.expiresAt && approval.expiresAt < now) {
        if (approval.status === 'pending') {
          approval.status = 'expired';
        }
        this.approvals.delete(id);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.debug(`[ApprovalStore] Evicted ${expiredCount} expired approvals`);
    }
  }
}

export const defaultApprovalStore = new ExecApprovalStore();
