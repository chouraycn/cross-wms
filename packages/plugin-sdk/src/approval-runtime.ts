import EventEmitter from 'eventemitter3';
import type {
  ApprovalPolicy,
  ApprovalResult,
  ApprovalRequest,
  AuditLogger,
  AuditLogEntry,
} from './types';

/**
 * ApprovalRuntime 事件
 */
export interface ApprovalRuntimeEvents {
  approval_requested: [request: ApprovalRequest];
  approval_completed: [request: ApprovalRequest, result: ApprovalResult];
  policy_changed: [policy: ApprovalPolicy];
}

/**
 * 默认审批策略
 */
const DEFAULT_POLICY: ApprovalPolicy = {
  mode: 'manual',
  timeout: 60000, // 60 秒
};

/**
 * ApprovalRuntime 类
 *
 * 负责工具调用审批流程管理，支持自动、手动和交互式审批模式。
 * 内置审计日志功能，记录所有审批操作。
 */
export class ApprovalRuntime extends EventEmitter<ApprovalRuntimeEvents> implements AuditLogger {
  private policy: ApprovalPolicy;
  private pendingRequests: Map<string, ApprovalRequest> = new Map();
  private auditEntries: AuditLogEntry[] = [];
  private requestCounter = 0;

  constructor(initialPolicy?: ApprovalPolicy) {
    super();
    this.policy = initialPolicy ?? DEFAULT_POLICY;
  }

  /**
   * 请求审批
   * @param toolName 工具名称
   * @param args 工具参数
   * @returns 审批结果
   */
  async requestApproval(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ApprovalResult> {
    // 创建审批请求
    const request: ApprovalRequest = {
      id: `approval-${++this.requestCounter}`,
      toolName,
      args,
      timestamp: Date.now(),
    };

    // 记录审批请求
    this.pendingRequests.set(request.id, request);
    this.emit('approval_requested', request);
    this.log({
      action: 'request',
      toolName,
      args,
    });

    let result: ApprovalResult;

    try {
      // 根据策略决定审批方式
      result = await this.processRequest(request);
    } catch (error) {
      result = {
        approved: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }

    // 记录审批结果
    this.pendingRequests.delete(request.id);
    this.emit('approval_completed', request, result);
    this.log({
      action: result.approved ? 'approve' : 'reject',
      toolName,
      result,
      actor: result.approver,
    });

    return result;
  }

  /**
   * 设置审批策略
   * @param policy 审批策略
   */
  setPolicy(policy: ApprovalPolicy): void {
    this.policy = policy;
    this.emit('policy_changed', policy);
  }

  /**
   * 获取审批策略
   * @returns 当前审批策略
   */
  getPolicy(): ApprovalPolicy {
    return { ...this.policy };
  }

  /**
   * 获取审计日志记录器
   */
  get auditLog(): AuditLogger {
    return this;
  }

  /**
   * 记录审计日志
   */
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    this.auditEntries.push(fullEntry);
  }

  /**
   * 获取审计日志条目
   */
  getEntries(filter?: {
    toolName?: string;
    from?: number;
    to?: number;
  }): AuditLogEntry[] {
    let entries = this.auditEntries;

    if (filter) {
      if (filter.toolName) {
        entries = entries.filter((e) => e.toolName === filter.toolName);
      }
      if (filter.from) {
        entries = entries.filter((e) => e.timestamp >= filter.from!);
      }
      if (filter.to) {
        entries = entries.filter((e) => e.timestamp <= filter.to!);
      }
    }

    return entries;
  }

  /**
   * 清空审计日志
   */
  clear(): void {
    this.auditEntries = [];
  }

  /**
   * 获取待处理的请求
   */
  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * 处理审批请求（内部方法）
   */
  private async processRequest(request: ApprovalRequest): Promise<ApprovalResult> {
    const { toolName } = request;

    // 自动审批列表
    if (this.policy.autoApprove?.includes(toolName)) {
      return {
        approved: true,
        reason: 'Auto-approved by policy',
        timestamp: Date.now(),
      };
    }

    // 自动拒绝列表
    if (this.policy.autoReject?.includes(toolName)) {
      return {
        approved: false,
        reason: 'Auto-rejected by policy',
        timestamp: Date.now(),
      };
    }

    // 根据模式处理
    switch (this.policy.mode) {
      case 'auto':
        return {
          approved: true,
          reason: 'Auto-approved in auto mode',
          timestamp: Date.now(),
        };

      case 'manual':
        // 模拟手动审批等待
        // 实际实现中应该等待外部审批操作
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
          approved: true,
          reason: 'Approved in manual mode',
          timestamp: Date.now(),
        };

      case 'interactive':
        // 模拟交互式审批
        // 实际实现中应该等待用户交互
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
          approved: !this.policy.requireConfirmation?.includes(toolName),
          reason: this.policy.requireConfirmation?.includes(toolName)
            ? 'Requires explicit confirmation'
            : 'Approved in interactive mode',
          timestamp: Date.now(),
        };

      default:
        return {
          approved: false,
          reason: 'Unknown approval mode',
          timestamp: Date.now(),
        };
    }
  }
}

/**
 * 默认 ApprovalRuntime 实例
 */
export const approvalRuntime = new ApprovalRuntime();