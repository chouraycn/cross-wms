/**
 * Approval Manager — 执行审批流管理
 *
 * 配合 toolPolicyEngine 使用，高风险工具调用需要用户审批确认。
 *
 * 功能：
 * - 创建审批请求
 * - 批准/拒绝/取消请求
 * - 等待审批结果（Promise）
 * - 超时自动处理
 * - 事件通知
 * - 自动批准模式
 *
 * 使用方式：
 *   import approvalManager from './approvalManager.js';
 *   const request = approvalManager.createRequest('shell_exec', { cmd: 'ls' }, 'critical', '需要执行终端命令');
 *   const result = await approvalManager.waitForApproval(request.id);
 */

import { EventEmitter } from 'events';

// ===================== 类型定义 =====================

/** 审批请求状态 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled';

/** 风险等级（与 toolPolicyEngine 保持一致） */
export type ApprovalRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/** 审批模式 */
export type ApprovalMode = 'manual' | 'auto_approve_safe' | 'auto_approve_all';

/**
 * 审批请求
 */
export interface ApprovalRequest {
  /** 请求唯一 ID */
  id: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  toolArgs: Record<string, unknown>;
  /** 风险等级 */
  riskLevel: ApprovalRiskLevel;
  /** 审批原因/说明 */
  reason: string;
  /** 当前状态 */
  status: ApprovalStatus;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 批准时间戳（毫秒） */
  approvedAt?: number;
  /** 拒绝时间戳（毫秒） */
  rejectedAt?: number;
  /** 超时时间戳（毫秒） */
  timeoutAt?: number;
  /** 会话 ID */
  sessionId?: string;
  /** 请求者标识 */
  requester?: string;
  /** 批准人 */
  approver?: string;
  /** 拒绝原因 */
  rejectReason?: string;
}

/**
 * ApprovalManager 配置
 */
export interface ApprovalManagerConfig {
  /** 默认超时时间（毫秒），默认 5 分钟 */
  defaultTimeoutMs: number;
  /** 自动批准的工具列表/模式（支持通配符 `*`） */
  autoApprovedTools: string[];
  /** 每会话最大待审批数，默认 10 */
  maxPendingPerSession: number;
  /** 审批模式，默认 manual */
  mode: ApprovalMode;
}

/** 审批事件类型 */
export type ApprovalEvent =
  | 'request_created'
  | 'request_approved'
  | 'request_rejected'
  | 'request_timeout'
  | 'request_cancelled';

// ===================== 内部类型 =====================

interface WaitingPromise {
  resolve: (request: ApprovalRequest) => void;
  reject: (error: Error) => void;
  timeoutTimer?: NodeJS.Timeout;
}

// ===================== ApprovalManager 类 =====================

/**
 * 审批管理器
 *
 * 功能：
 * - 创建审批请求
 * - 批准/拒绝/取消请求
 * - 等待审批结果（Promise）
 * - 超时自动处理
 * - 事件通知
 * - 自动批准模式
 *
 * 单例模式，通过 default export 获取全局实例。
 */
export class ApprovalManager extends EventEmitter {
  private requests: Map<string, ApprovalRequest>;
  private waitingPromises: Map<string, WaitingPromise>;
  private config: ApprovalManagerConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.setMaxListeners(100);
    this.requests = new Map();
    this.waitingPromises = new Map();
    this.config = {
      defaultTimeoutMs: 5 * 60 * 1000,
      autoApprovedTools: [],
      maxPendingPerSession: 10,
      mode: 'manual',
    };
  }

  // ===================== 配置管理 =====================

  /**
   * 更新配置
   *
   * @param config - 配置项（部分更新）
   */
  setConfig(config: Partial<ApprovalManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): ApprovalManagerConfig {
    return { ...this.config };
  }

  /**
   * 设置审批模式
   *
   * @param mode - 审批模式
   */
  setMode(mode: ApprovalMode): void {
    this.config.mode = mode;
  }

  // ===================== 请求创建 =====================

  /**
   * 创建审批请求
   *
   * 根据当前审批模式可能自动批准：
   * - auto_approve_all：直接批准
   * - auto_approve_safe：safe/low 风险自动批准
   * - manual：全部手动审批
   *
   * 同时检查 autoApprovedTools 列表，匹配的工具自动批准。
   *
   * @param toolName - 工具名称
   * @param toolArgs - 工具参数
   * @param riskLevel - 风险等级
   * @param reason - 审批原因
   * @param sessionId - 会话 ID（可选）
   * @param requester - 请求者（可选）
   * @returns 审批请求
   */
  createRequest(
    toolName: string,
    toolArgs: Record<string, unknown>,
    riskLevel: ApprovalRiskLevel,
    reason: string,
    sessionId?: string,
    requester?: string,
  ): ApprovalRequest {
    const id = this.generateId();
    const now = Date.now();

    if (sessionId) {
      const pendingCount = this.getPendingRequests(sessionId).length;
      if (pendingCount >= this.config.maxPendingPerSession) {
        throw new Error(
          `会话 ${sessionId} 待审批请求已达上限 ${this.config.maxPendingPerSession}`,
        );
      }
    }

    const request: ApprovalRequest = {
      id,
      toolName,
      toolArgs,
      riskLevel,
      reason,
      status: 'pending',
      createdAt: now,
      sessionId,
      requester,
    };

    if (this.shouldAutoApprove(toolName, riskLevel)) {
      request.status = 'approved';
      request.approvedAt = now;
      this.requests.set(id, request);
      this.emit('request_created', request);
      this.emit('request_approved', request);
      this.resolveWaiting(id, request);
      return request;
    }

    this.requests.set(id, request);
    this.emit('request_created', request);

    const timeoutMs = this.config.defaultTimeoutMs;
    if (timeoutMs > 0) {
      request.timeoutAt = now + timeoutMs;
      this.scheduleTimeout(id, timeoutMs);
    }

    return request;
  }

  // ===================== 请求操作 =====================

  /**
   * 批准请求
   *
   * @param requestId - 请求 ID
   * @param approver - 批准人（可选）
   * @returns 更新后的请求
   */
  approveRequest(requestId: string, approver?: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`审批请求不存在: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`请求状态为 ${request.status}，无法批准`);
    }

    request.status = 'approved';
    request.approvedAt = Date.now();
    if (approver) {
      request.approver = approver;
    }

    this.clearTimeoutTimer(requestId);
    this.emit('request_approved', request);
    this.resolveWaiting(requestId, request);

    return request;
  }

  /**
   * 拒绝请求
   *
   * @param requestId - 请求 ID
   * @param reason - 拒绝原因（可选）
   * @param approver - 拒绝人（可选）
   * @returns 更新后的请求
   */
  rejectRequest(requestId: string, reason?: string, approver?: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`审批请求不存在: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`请求状态为 ${request.status}，无法拒绝`);
    }

    request.status = 'rejected';
    request.rejectedAt = Date.now();
    if (reason) {
      request.rejectReason = reason;
    }
    if (approver) {
      request.approver = approver;
    }

    this.clearTimeoutTimer(requestId);
    this.emit('request_rejected', request);
    this.resolveWaiting(requestId, request);

    return request;
  }

  /**
   * 取消请求
   *
   * @param requestId - 请求 ID
   * @returns 更新后的请求
   */
  cancelRequest(requestId: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`审批请求不存在: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`请求状态为 ${request.status}，无法取消`);
    }

    request.status = 'cancelled';
    this.clearTimeoutTimer(requestId);
    this.emit('request_cancelled', request);
    this.rejectWaiting(requestId, new Error('审批请求已取消'));

    return request;
  }

  // ===================== 查询方法 =====================

  /**
   * 获取请求详情
   *
   * @param requestId - 请求 ID
   * @returns 请求详情，不存在返回 undefined
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * 获取待审批请求列表
   *
   * @param sessionId - 会话 ID（可选，不传则返回所有）
   * @returns 待审批请求列表
   */
  getPendingRequests(sessionId?: string): ApprovalRequest[] {
    const result: ApprovalRequest[] = [];
    for (const request of this.requests.values()) {
      if (request.status !== 'pending') continue;
      if (sessionId && request.sessionId !== sessionId) continue;
      result.push(request);
    }
    return result.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * 获取所有请求
   *
   * @param sessionId - 会话 ID（可选）
   * @param limit - 返回数量限制（可选）
   */
  getAllRequests(sessionId?: string, limit?: number): ApprovalRequest[] {
    const result: ApprovalRequest[] = [];
    for (const request of this.requests.values()) {
      if (sessionId && request.sessionId !== sessionId) continue;
      result.push(request);
    }
    result.sort((a, b) => b.createdAt - a.createdAt);
    if (limit && limit > 0) {
      return result.slice(0, limit);
    }
    return result;
  }

  // ===================== 等待审批 =====================

  /**
   * 等待审批结果
   *
   * 返回一个 Promise，在请求被批准/拒绝/超时/取消时 resolve。
   * 如果请求已处于终态，则立即 resolve。
   *
   * @param requestId - 请求 ID
   * @param timeoutMs - 超时时间（毫秒，不传则使用默认配置）
   * @returns Promise，resolve 时返回最终的请求
   */
  waitForApproval(requestId: string, timeoutMs?: number): Promise<ApprovalRequest> {
    const request = this.requests.get(requestId);
    if (!request) {
      return Promise.reject(new Error(`审批请求不存在: ${requestId}`));
    }

    if (request.status !== 'pending') {
      return Promise.resolve(request);
    }

    return new Promise<ApprovalRequest>((resolve, reject) => {
      const existing = this.waitingPromises.get(requestId);
      if (existing) {
        reject(new Error(`该请求已有等待中的 Promise: ${requestId}`));
        return;
      }

      const timeout = timeoutMs ?? this.config.defaultTimeoutMs;
      let timeoutTimer: NodeJS.Timeout | undefined;

      if (timeout > 0) {
        timeoutTimer = setTimeout(() => {
          this.handleTimeout(requestId);
        }, timeout);
      }

      this.waitingPromises.set(requestId, {
        resolve,
        reject,
        timeoutTimer,
      });
    });
  }

  // ===================== 清理过期 =====================

  /**
   * 清理超时请求
   *
   * 将所有已超时但仍处于 pending 状态的请求标记为 timeout。
   * 可手动调用，也由内部定时器定期触发。
   *
   * @returns 被清理的请求数量
   */
  cleanupExpired(): number {
    const now = Date.now();
    let count = 0;

    for (const request of this.requests.values()) {
      if (request.status !== 'pending') continue;
      if (!request.timeoutAt) continue;
      if (now >= request.timeoutAt) {
        this.handleTimeout(request.id);
        count++;
      }
    }

    return count;
  }

  /**
   * 启动定期清理定时器
   *
   * @param intervalMs - 清理间隔（毫秒），默认 60 秒
   */
  startCleanupTimer(intervalMs: number = 60 * 1000): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);
    this.cleanupTimer.unref?.();
  }

  /**
   * 停止定期清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  // ===================== 事件监听（便捷方法） =====================

  /**
   * 监听审批事件（覆盖 EventEmitter.on，提供类型提示）
   *
   * @param event - 事件类型
   * @param handler - 事件处理函数
   * @returns this（支持链式调用）
   */
  on(event: ApprovalEvent, handler: (request: ApprovalRequest) => void): this {
    return super.on(event, handler);
  }

  /**
   * 单次监听审批事件
   *
   * @param event - 事件类型
   * @param handler - 事件处理函数
   * @returns this（支持链式调用）
   */
  once(event: ApprovalEvent, handler: (request: ApprovalRequest) => void): this {
    return super.once(event, handler);
  }

  /**
   * 移除事件监听
   *
   * @param event - 事件类型
   * @param handler - 事件处理函数
   * @returns this（支持链式调用）
   */
  off(event: ApprovalEvent, handler: (request: ApprovalRequest) => void): this {
    return super.off(event, handler);
  }

  // ===================== 内部方法 =====================

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `appr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 判断是否应该自动批准
   */
  private shouldAutoApprove(toolName: string, riskLevel: ApprovalRiskLevel): boolean {
    if (this.config.mode === 'auto_approve_all') {
      return true;
    }

    if (
      this.config.mode === 'auto_approve_safe' &&
      (riskLevel === 'safe' || riskLevel === 'low')
    ) {
      return true;
    }

    if (this.config.autoApprovedTools.length > 0) {
      for (const pattern of this.config.autoApprovedTools) {
        if (this.matchPattern(pattern, toolName)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 通配符模式匹配
   *
   * 支持 `*` 通配符，匹配任意字符（0 个或多个）。
   *
   * @param pattern - 模式字符串
   * @param value - 待匹配字符串
   * @returns 是否匹配
   */
  private matchPattern(pattern: string, value: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern === value) {
      return true;
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return value.startsWith(prefix);
    }

    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return value.endsWith(suffix);
    }

    return false;
  }

  /**
   * 安排超时处理
   */
  private scheduleTimeout(requestId: string, timeoutMs: number): void {
    const waiting = this.waitingPromises.get(requestId);
    if (waiting?.timeoutTimer) {
      clearTimeout(waiting.timeoutTimer);
    }

    const timer = setTimeout(() => {
      this.handleTimeout(requestId);
    }, timeoutMs);

    if (waiting) {
      waiting.timeoutTimer = timer;
    }
  }

  /**
   * 清除超时定时器
   */
  private clearTimeoutTimer(requestId: string): void {
    const waiting = this.waitingPromises.get(requestId);
    if (waiting?.timeoutTimer) {
      clearTimeout(waiting.timeoutTimer);
      waiting.timeoutTimer = undefined;
    }
  }

  /**
   * 处理超时
   */
  private handleTimeout(requestId: string): void {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') {
      return;
    }

    request.status = 'timeout';
    request.timeoutAt = Date.now();
    this.emit('request_timeout', request);
    this.resolveWaiting(requestId, request);
  }

  /**
   * 解析等待的 Promise
   */
  private resolveWaiting(requestId: string, request: ApprovalRequest): void {
    const waiting = this.waitingPromises.get(requestId);
    if (waiting) {
      if (waiting.timeoutTimer) {
        clearTimeout(waiting.timeoutTimer);
      }
      waiting.resolve(request);
      this.waitingPromises.delete(requestId);
    }
  }

  /**
   * 拒绝等待的 Promise
   */
  private rejectWaiting(requestId: string, error: Error): void {
    const waiting = this.waitingPromises.get(requestId);
    if (waiting) {
      if (waiting.timeoutTimer) {
        clearTimeout(waiting.timeoutTimer);
      }
      waiting.reject(error);
      this.waitingPromises.delete(requestId);
    }
  }
}

// ===================== 单例导出 =====================

const approvalManager = new ApprovalManager();

export default approvalManager;
