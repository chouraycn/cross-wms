/**
 * ACP Permission Relay
 * 权限中继 - 权限请求转发、审批状态管理
 *
 * 参考 openclaw/src/acp/permission-relay.ts 设计
 */

import type { PolicyEvaluationResult } from "./policy.js";
import type { ToolCall } from "./acpTypes.js";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalScope = "single" | "session" | "global";

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolName: string;
  input?: unknown;
  evaluation: PolicyEvaluationResult;
  requestedAt: number;
  expiresAt?: number;
  scope: ApprovalScope;
  status: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: number;
  denialReason?: string;
}

export interface PermissionRelayOptions {
  defaultExpiryMs?: number;
  maxPendingRequests?: number;
}

export class PermissionRelay {
  private requests: Map<string, ApprovalRequest> = new Map();
  private pendingCount = 0;
  private defaultExpiryMs: number;
  private maxPendingRequests: number;

  constructor(options: PermissionRelayOptions = {}) {
    this.defaultExpiryMs = options.defaultExpiryMs ?? 300_000;
    this.maxPendingRequests = options.maxPendingRequests ?? 100;
    this.startExpiryChecker();
  }

  createRequest(sessionId: string, toolName: string, input: unknown, evaluation: PolicyEvaluationResult): ApprovalRequest {
    if (this.pendingCount >= this.maxPendingRequests) {
      throw new Error("Max pending approval requests exceeded");
    }

    const id = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = Date.now() + this.defaultExpiryMs;

    const request: ApprovalRequest = {
      id,
      sessionId,
      toolName,
      input,
      evaluation,
      requestedAt: Date.now(),
      expiresAt,
      scope: evaluation.level === "deny" ? "single" : "single",
      status: "pending",
    };

    this.requests.set(id, request);
    this.pendingCount++;

    return request;
  }

  approve(requestId: string, approvedBy?: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") {
      return false;
    }

    request.status = "approved";
    request.approvedBy = approvedBy;
    request.approvedAt = Date.now();
    this.pendingCount--;

    return true;
  }

  deny(requestId: string, reason?: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") {
      return false;
    }

    request.status = "denied";
    request.denialReason = reason;
    this.pendingCount--;

    return true;
  }

  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  getPendingRequests(sessionId?: string): ApprovalRequest[] {
    return Array.from(this.requests.values()).filter(req => {
      if (req.status !== "pending") return false;
      if (sessionId && req.sessionId !== sessionId) return false;
      return !this.isExpired(req);
    });
  }

  isApproved(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request) return false;
    if (request.status !== "approved") return false;
    if (this.isExpired(request)) {
      request.status = "expired";
      return false;
    }
    return true;
  }

  canExecute(sessionId: string, toolName: string, input: unknown): boolean {
    const pending = this.getPendingRequests(sessionId);
    const existing = pending.find(r => r.toolName === toolName);
    
    if (existing && existing.status === "approved") {
      return true;
    }

    return false;
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [id, request] of this.requests) {
      if (this.isExpired(request)) {
        if (request.status === "pending") {
          this.pendingCount--;
        }
        request.status = "expired";
      }
    }
  }

  clearSessionRequests(sessionId: string): void {
    for (const [id, request] of this.requests) {
      if (request.sessionId === sessionId) {
        if (request.status === "pending") {
          this.pendingCount--;
        }
        this.requests.delete(id);
      }
    }
  }

  clearAllRequests(): void {
    this.requests.clear();
    this.pendingCount = 0;
  }

  private isExpired(request: ApprovalRequest): boolean {
    if (!request.expiresAt) return false;
    return Date.now() > request.expiresAt;
  }

  private startExpiryChecker(): void {
    setInterval(() => {
      this.cleanupExpired();
    }, 60_000);
  }

  getStats(): { pending: number; total: number; approved: number; denied: number } {
    let approved = 0;
    let denied = 0;

    for (const request of this.requests.values()) {
      if (request.status === "approved") approved++;
      else if (request.status === "denied") denied++;
    }

    return {
      pending: this.pendingCount,
      total: this.requests.size,
      approved,
      denied,
    };
  }
}

export const permissionRelay = new PermissionRelay();
