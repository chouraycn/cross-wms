/**
 * Execution Approval System
 * 执行审批系统 - 三级安全审批机制
 */

export type ApprovalLevel = "auto-deny" | "denylist" | "allowlist" | "full-auto";
export type ApprovalStatus = "pending" | "approved" | "denied" | "timed_out" | "cancelled";
export type ApprovalRequestType =
  | "tool_call"
  | "bash_command"
  | "file_write"
  | "file_delete"
  | "network_request"
  | "subprocess"
  | "system_command";

export interface ApprovalRequest {
  id: string;
  type: ApprovalRequestType;
  description: string;
  details: Record<string, unknown>;
  sessionKey?: string;
  userId?: string;
  toolName?: string;
  command?: string;
  filePath?: string;
  status: ApprovalStatus;
  level: ApprovalLevel;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  decidedBy?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
  level: ApprovalLevel;
  requestId?: string;
}

export interface ApprovalPolicy {
  id: string;
  name: string;
  description?: string;
  level: ApprovalLevel;
  patterns: string[];
  type: ApprovalRequestType | "all";
  priority: number;
  enabled: boolean;
}

class ExecutionApprovalManager {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly policies = new Map<string, ApprovalPolicy>();
  private defaultLevel: ApprovalLevel = "denylist";
  private defaultTimeoutMs = 5 * 60 * 1000;
  private readonly listeners = new Set<(request: ApprovalRequest) => void>();

  constructor() {
    this.initializeDefaultPolicies();
  }

  private initializeDefaultPolicies(): void {
    const defaults: ApprovalPolicy[] = [
      // 始终允许的安全操作
      {
        id: "policy-safe-read",
        name: "Safe Read Operations",
        level: "full-auto",
        patterns: ["memory_search", "tool_search", "web_search", "get_current_time", "calculator"],
        type: "tool_call",
        priority: 100,
        enabled: true,
      },
      {
        id: "policy-safe-ls",
        name: "Safe List Commands",
        level: "full-auto",
        patterns: ["ls ", "cat ", "grep ", "find ", "pwd ", "echo ", "head ", "tail ", "wc "],
        type: "bash_command",
        priority: 90,
        enabled: true,
      },
      // 始终拒绝的危险操作
      {
        id: "policy-dangerous-rm",
        name: "Dangerous Remove Commands",
        level: "auto-deny",
        patterns: ["rm -rf /", "rm -rf /*", "mkfs", "dd if="],
        type: "bash_command",
        priority: 1000,
        enabled: true,
      },
      {
        id: "policy-dangerous-system",
        name: "Dangerous System Commands",
        level: "auto-deny",
        patterns: ["sudo ", "su -", "chmod 777 /", "reboot", "shutdown"],
        type: "bash_command",
        priority: 999,
        enabled: true,
      },
      // 需要审批的操作
      {
        id: "policy-file-write",
        name: "File Write Operations",
        level: "allowlist",
        patterns: ["file_write", "write_file", "create_file", "edit_file"],
        type: "tool_call",
        priority: 50,
        enabled: true,
      },
      {
        id: "policy-file-delete",
        name: "File Delete Operations",
        level: "allowlist",
        patterns: ["file_delete", "delete_file", "remove_file", "rm "],
        type: "all",
        priority: 60,
        enabled: true,
      },
      {
        id: "policy-bash-default",
        name: "Default Bash Commands",
        level: "denylist",
        patterns: ["*"],
        type: "bash_command",
        priority: 10,
        enabled: true,
      },
    ];

    for (const policy of defaults) {
      this.policies.set(policy.id, policy);
    }
  }

  // ========== Policy Management ==========

  addPolicy(policy: Omit<ApprovalPolicy, "enabled"> & Partial<Pick<ApprovalPolicy, "enabled">>): ApprovalPolicy {
    const fullPolicy: ApprovalPolicy = {
      ...policy,
      enabled: policy.enabled ?? true,
    };
    this.policies.set(policy.id, fullPolicy);
    return fullPolicy;
  }

  removePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  listPolicies(options?: {
    type?: ApprovalRequestType | "all";
    enabled?: boolean;
    level?: ApprovalLevel;
  }): ApprovalPolicy[] {
    let policies = Array.from(this.policies.values());

    if (options?.type && options.type !== "all") {
      policies = policies.filter((p) => p.type === options.type || p.type === "all");
    }
    if (options?.enabled !== undefined) {
      policies = policies.filter((p) => p.enabled === options.enabled);
    }
    if (options?.level) {
      policies = policies.filter((p) => p.level === options.level);
    }

    return policies.sort((a, b) => b.priority - a.priority);
  }

  setDefaultLevel(level: ApprovalLevel): void {
    this.defaultLevel = level;
  }

  getDefaultLevel(): ApprovalLevel {
    return this.defaultLevel;
  }

  // ========== Approval Request ==========

  async requestApproval(params: {
    type: ApprovalRequestType;
    description: string;
    details: Record<string, unknown>;
    sessionKey?: string;
    userId?: string;
    toolName?: string;
    command?: string;
    filePath?: string;
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<ApprovalResult> {
    // 先检查策略，可能自动批准或拒绝
    const policyResult = this.evaluatePolicies(params.type, params.toolName ?? params.command ?? "");

    if (policyResult.level === "full-auto") {
      return {
        approved: true,
        reason: `Auto-approved by policy: ${policyResult.policyName}`,
        level: "full-auto",
      };
    }

    if (policyResult.level === "auto-deny") {
      return {
        approved: false,
        reason: `Auto-denied by policy: ${policyResult.policyName}`,
        level: "auto-deny",
      };
    }

    // 需要人工审批
    const requestId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const request: ApprovalRequest = {
      id: requestId,
      type: params.type,
      description: params.description,
      details: params.details,
      sessionKey: params.sessionKey,
      userId: params.userId,
      toolName: params.toolName,
      command: params.command,
      filePath: params.filePath,
      status: "pending",
      level: policyResult.level,
      createdAt: now,
      expiresAt: now + (params.timeoutMs ?? this.defaultTimeoutMs),
      metadata: params.metadata,
    };

    this.requests.set(requestId, request);
    this.notifyListeners(request);

    // 如果是 denylist 级别，默认批准（不在拒绝列表中的都允许）
    if (policyResult.level === "denylist") {
      return {
        approved: true,
        reason: "Denylist policy: not in denylist",
        level: "denylist",
        requestId,
      };
    }

    // allowlist 级别需要等待审批
    // 这里返回 pending 状态，实际实现中应该等待用户审批
    return {
      approved: false,
      reason: "Pending approval",
      level: "allowlist",
      requestId,
    };
  }

  private evaluatePolicies(type: ApprovalRequestType, target: string): {
    level: ApprovalLevel;
    policyName?: string;
  } {
    const policies = this.listPolicies({ type, enabled: true });

    for (const policy of policies) {
      const matches = policy.patterns.some((pattern) => {
        if (pattern === "*") return true;
        if (pattern.endsWith("*")) {
          return target.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
        }
        if (pattern.startsWith("*")) {
          return target.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
        }
        return target.toLowerCase().includes(pattern.toLowerCase());
      });

      if (matches) {
        return { level: policy.level, policyName: policy.name };
      }
    }

    return { level: this.defaultLevel };
  }

  // ========== Decision ==========

  approve(requestId: string, reason?: string, decidedBy?: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") return false;

    request.status = "approved";
    request.decidedAt = Date.now();
    request.decidedBy = decidedBy;
    request.reason = reason;
    this.requests.set(requestId, request);
    this.notifyListeners(request);
    return true;
  }

  deny(requestId: string, reason?: string, decidedBy?: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") return false;

    request.status = "denied";
    request.decidedAt = Date.now();
    request.decidedBy = decidedBy;
    request.reason = reason;
    this.requests.set(requestId, request);
    this.notifyListeners(request);
    return true;
  }

  cancel(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") return false;

    request.status = "cancelled";
    request.decidedAt = Date.now();
    this.requests.set(requestId, request);
    this.notifyListeners(request);
    return true;
  }

  checkTimeouts(): number {
    const now = Date.now();
    let timedOut = 0;

    for (const [id, request] of this.requests) {
      if (request.status === "pending" && now > request.expiresAt) {
        request.status = "timed_out";
        request.decidedAt = now;
        this.requests.set(id, request);
        this.notifyListeners(request);
        timedOut++;
      }
    }

    return timedOut;
  }

  // ========== Query ==========

  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  listRequests(options?: {
    status?: ApprovalStatus;
    type?: ApprovalRequestType;
    sessionKey?: string;
    limit?: number;
  }): ApprovalRequest[] {
    let requests = Array.from(this.requests.values());

    if (options?.status) {
      requests = requests.filter((r) => r.status === options.status);
    }
    if (options?.type) {
      requests = requests.filter((r) => r.type === options.type);
    }
    if (options?.sessionKey) {
      requests = requests.filter((r) => r.sessionKey === options.sessionKey);
    }

    requests.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      requests = requests.slice(0, options.limit);
    }

    return requests;
  }

  // ========== Listeners ==========

  onRequest(listener: (request: ApprovalRequest) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(request: ApprovalRequest): void {
    for (const listener of this.listeners) {
      try {
        listener(request);
      } catch (e) {
        console.error("[exec-approval] Listener error:", e);
      }
    }
  }

  // ========== Stats ==========

  getStats(): {
    totalRequests: number;
    pending: number;
    approved: number;
    denied: number;
    timedOut: number;
    autoApproved: number;
    autoDenied: number;
    byType: Record<ApprovalRequestType, number>;
  } {
    const requests = Array.from(this.requests.values());
    const byType = {} as Record<ApprovalRequestType, number>;

    for (const req of requests) {
      byType[req.type] = (byType[req.type] ?? 0) + 1;
    }

    return {
      totalRequests: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      denied: requests.filter((r) => r.status === "denied").length,
      timedOut: requests.filter((r) => r.status === "timed_out").length,
      autoApproved: requests.filter((r) => r.status === "approved" && r.level === "full-auto").length,
      autoDenied: requests.filter((r) => r.status === "denied" && r.level === "auto-deny").length,
      byType,
    };
  }

  cleanupOldRequests(olderThanMs = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, request] of this.requests) {
      if (now - request.createdAt > olderThanMs && request.status !== "pending") {
        this.requests.delete(id);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.requests.clear();
    this.policies.clear();
    this.listeners.clear();
  }
}

const EXEC_APPROVAL_INSTANCE = new ExecutionApprovalManager();

export function getExecutionApproval(): ExecutionApprovalManager {
  return EXEC_APPROVAL_INSTANCE;
}

export function requestExecutionApproval(
  params: Parameters<ExecutionApprovalManager["requestApproval"]>[0],
): ReturnType<ExecutionApprovalManager["requestApproval"]> {
  return EXEC_APPROVAL_INSTANCE.requestApproval(params);
}

export function approveExecution(requestId: string, reason?: string): boolean {
  return EXEC_APPROVAL_INSTANCE.approve(requestId, reason);
}

export function denyExecution(requestId: string, reason?: string): boolean {
  return EXEC_APPROVAL_INSTANCE.deny(requestId, reason);
}

export function resetExecutionApprovalForTests(): void {
  EXEC_APPROVAL_INSTANCE.clear();
}

export type { ExecutionApprovalManager };
