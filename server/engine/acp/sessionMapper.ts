/**
 * ACP Session Mapper
 * 会话映射器 - 管理会话与权限、策略的绑定关系
 *
 * 参考 openclaw/src/acp/session-mapper.ts 设计
 *
 * v2.0: 新增 ACP request metadata 解析和 sessionKey resolve 逻辑
 */

import type { AcpSession } from "./acpServer.js";
import type { PermissionProfile } from "./policy.js";
import type { ApprovalRequest } from "./permissionRelay.js";

// ===================== ACP Session Metadata 类型 =====================

/** ACP request metadata 解析结果 */
export interface AcpSessionMeta {
  sessionKey?: string;
  sessionLabel?: string;
  resetSession?: boolean;
  requireExisting?: boolean;
  prefixCwd?: boolean;
}

/** ACP server options（简化版，用于 resolveSessionKey） */
export interface AcpServerOptions {
  defaultSessionKey?: string;
  defaultSessionLabel?: string;
  requireExistingSession?: boolean;
  resetSession?: boolean;
}

/** 解析 ACP request metadata 到 session routing hints */
export function parseSessionMeta(meta: unknown): AcpSessionMeta {
  if (!meta || typeof meta !== "object") {
    return {};
  }
  const record = meta as Record<string, unknown>;
  return {
    sessionKey: readString(record, ["sessionKey", "session", "key"]),
    sessionLabel: readString(record, ["sessionLabel", "label"]),
    resetSession: readBool(record, ["resetSession", "reset"]),
    requireExisting: readBool(record, ["requireExistingSession", "requireExisting"]),
    prefixCwd: readBool(record, ["prefixCwd"]),
  };
}

/** 解析 ACP request metadata 并 resolve 最终 sessionKey */
export async function resolveSessionKey(params: {
  meta: AcpSessionMeta;
  fallbackKey: string;
  opts?: AcpServerOptions;
  resolveLabel?: (label: string) => Promise<string | null>;
  resolveKey?: (key: string) => Promise<boolean>;
}): Promise<string> {
  const requestedLabel = params.meta.sessionLabel ?? params.opts?.defaultSessionLabel;
  const requestedKey = params.meta.sessionKey ?? params.opts?.defaultSessionKey;
  const requireExisting = params.meta.requireExisting ?? params.opts?.requireExistingSession ?? false;

  // 优先使用 label resolve
  if (params.meta.sessionLabel) {
    if (params.resolveLabel) {
      const resolved = await params.resolveLabel(params.meta.sessionLabel);
      if (!resolved) {
        throw new Error(`Unable to resolve session label: ${params.meta.sessionLabel}`);
      }
      return resolved;
    }
    // 没有 resolveLabel 函数，直接使用 label 作为 key
    return params.meta.sessionLabel;
  }

  // 使用 sessionKey
  if (params.meta.sessionKey) {
    if (!requireExisting) {
      return params.meta.sessionKey;
    }
    if (params.resolveKey) {
      const exists = await params.resolveKey(params.meta.sessionKey);
      if (!exists) {
        throw new Error(`Session key not found: ${params.meta.sessionKey}`);
      }
    }
    return params.meta.sessionKey;
  }

  // 使用 default label
  if (requestedLabel) {
    if (params.resolveLabel) {
      const resolved = await params.resolveLabel(requestedLabel);
      if (!resolved) {
        throw new Error(`Unable to resolve session label: ${requestedLabel}`);
      }
      return resolved;
    }
    return requestedLabel;
  }

  // 使用 default key
  if (requestedKey) {
    if (!requireExisting) {
      return requestedKey;
    }
    if (params.resolveKey) {
      const exists = await params.resolveKey(requestedKey);
      if (!exists) {
        throw new Error(`Session key not found: ${requestedKey}`);
      }
    }
    return requestedKey;
  }

  // 最终 fallback
  return params.fallbackKey;
}

/** 发送 session reset（如果需要） */
export async function resetSessionIfNeeded(params: {
  meta: AcpSessionMeta;
  sessionKey: string;
  opts?: AcpServerOptions;
  resetSession?: (key: string) => Promise<void>;
}): Promise<void> {
  const resetSession = params.meta.resetSession ?? params.opts?.resetSession ?? false;
  if (!resetSession) {
    return;
  }
  if (params.resetSession) {
    await params.resetSession(params.sessionKey);
  }
}

// ===================== 辅助函数 =====================

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readBool(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (value === "true" || value === 1) {
      return true;
    }
    if (value === "false" || value === 0) {
      return false;
    }
  }
  return undefined;
}

// ===================== Session Binding 类型 =====================

export interface SessionBinding {
  sessionId: string;
  userId?: string;
  channelId?: string;
  accountId?: string;
  peerId?: string;
  agentId?: string;
  policyProfileId: string;
  createdAt: number;
  expiresAt?: number;
}

export interface SessionContext {
  sessionId: string;
  session: AcpSession | null;
  binding: SessionBinding | null;
  activeApprovals: ApprovalRequest[];
  policyProfile: PermissionProfile | null;
}

export class SessionMapper {
  private bindings = new Map<string, SessionBinding>();
  private sessionToBinding = new Map<string, string>();

  bindSession(
    sessionId: string,
    options: {
      userId?: string;
      channelId?: string;
      accountId?: string;
      peerId?: string;
      agentId?: string;
      policyProfileId?: string;
      expiresAt?: number;
    },
  ): SessionBinding {
    const binding: SessionBinding = {
      sessionId,
      userId: options.userId,
      channelId: options.channelId,
      accountId: options.accountId,
      peerId: options.peerId,
      agentId: options.agentId,
      policyProfileId: options.policyProfileId ?? "default",
      createdAt: Date.now(),
      expiresAt: options.expiresAt,
    };

    const bindingId = this.generateBindingId(binding);
    this.bindings.set(bindingId, binding);
    this.sessionToBinding.set(sessionId, bindingId);

    return binding;
  }

  unbindSession(sessionId: string): boolean {
    const bindingId = this.sessionToBinding.get(sessionId);
    if (!bindingId) return false;

    this.bindings.delete(bindingId);
    this.sessionToBinding.delete(sessionId);
    return true;
  }

  getBinding(sessionId: string): SessionBinding | undefined {
    const bindingId = this.sessionToBinding.get(sessionId);
    if (!bindingId) return undefined;
    return this.bindings.get(bindingId);
  }

  getBindingById(bindingId: string): SessionBinding | undefined {
    return this.bindings.get(bindingId);
  }

  findBindings(query: {
    userId?: string;
    channelId?: string;
    accountId?: string;
    peerId?: string;
    agentId?: string;
  }): SessionBinding[] {
    return Array.from(this.bindings.values()).filter(binding => {
      if (query.userId && binding.userId !== query.userId) return false;
      if (query.channelId && binding.channelId !== query.channelId) return false;
      if (query.accountId && binding.accountId !== query.accountId) return false;
      if (query.peerId && binding.peerId !== query.peerId) return false;
      if (query.agentId && binding.agentId !== query.agentId) return false;
      return true;
    });
  }

  getPolicyProfileId(sessionId: string): string {
    const binding = this.getBinding(sessionId);
    return binding?.policyProfileId ?? "default";
  }

  updatePolicyProfile(sessionId: string, policyProfileId: string): boolean {
    const binding = this.getBinding(sessionId);
    if (!binding) return false;

    binding.policyProfileId = policyProfileId;
    const bindingId = this.sessionToBinding.get(sessionId);
    if (bindingId) {
      this.bindings.set(bindingId, binding);
    }
    return true;
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [bindingId, binding] of this.bindings) {
      if (binding.expiresAt && now > binding.expiresAt) {
        this.bindings.delete(bindingId);
        this.sessionToBinding.delete(binding.sessionId);
      }
    }
  }

  clearBindings(): void {
    this.bindings.clear();
    this.sessionToBinding.clear();
  }

  getUserSessions(userId: string): string[] {
    const sessions: string[] = [];
    for (const [sessionId] of this.sessionToBinding) {
      const binding = this.getBinding(sessionId);
      if (binding?.userId === userId) {
        sessions.push(sessionId);
      }
    }
    return sessions;
  }

  getStats(): {
    totalBindings: number;
    activeBindings: number;
    expiredBindings: number;
  } {
    const now = Date.now();
    let expired = 0;
    for (const binding of this.bindings.values()) {
      if (binding.expiresAt && now > binding.expiresAt) {
        expired++;
      }
    }

    return {
      totalBindings: this.bindings.size,
      activeBindings: this.bindings.size - expired,
      expiredBindings: expired,
    };
  }

  private generateBindingId(binding: SessionBinding): string {
    const parts = [
      binding.sessionId,
      binding.channelId ?? "",
      binding.accountId ?? "",
      binding.peerId ?? "",
    ].filter(Boolean);
    return parts.join(":");
  }
}

export const sessionMapper = new SessionMapper();
