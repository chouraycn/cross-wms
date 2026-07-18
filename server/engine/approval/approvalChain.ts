/**
 * Approval Chain — 多级审批链
 *
 * 与 approvalManager 配合使用，实现多级审批流。
 * 每一级有独立的超时时间和所需的批准人数。
 *
 * 功能：
 * - 创建多级审批链
 * - 提交审批请求并按级别依次等待
 * - 链暂停、恢复、取消
 * - 链状态查询
 *
 * 使用方式：
 *   const chain = new ApprovalChain({ approvalManager });
 *   const chainId = chain.createChain([
 *     { name: 'L1', requiredApprovers: 1, minRiskLevel: 'medium', timeoutMs: 60000, allowSelfApprove: false },
 *     { name: 'L2', requiredApprovers: 2, minRiskLevel: 'high', timeoutMs: 120000, allowSelfApprove: false },
 *   ]);
 *   const result = await chain.submit(chainId, { toolName: 'shell_exec', toolArgs: {}, riskLevel: 'critical', reason: '...' });
 */

import { EventEmitter } from 'events';
import approvalManager, { ApprovalManager, ApprovalRequest, ApprovalRiskLevel, ApprovalStatus } from '../approvalManager.js';

// ===================== 类型定义 =====================

/** 链状态 */
export type ChainStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'timeout' | 'cancelled' | 'paused';

/**
 * 审批链级别
 */
export interface ApprovalLevel {
  /** 级别名称 */
  name: string;
  /** 所需批准人数量 */
  requiredApprovers: number;
  /** 触发该级别的最低风险等级（低于此级别跳过） */
  minRiskLevel: ApprovalRiskLevel;
  /** 级别超时时间（毫秒） */
  timeoutMs: number;
  /** 是否允许自我批准（请求者可以批准自己的请求） */
  allowSelfApprove: boolean;
}

/**
 * 审批链请求
 */
export interface ApprovalRequestPayload {
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  toolArgs: Record<string, unknown>;
  /** 风险等级 */
  riskLevel: ApprovalRiskLevel;
  /** 审批原因 */
  reason: string;
  /** 会话 ID（可选） */
  sessionId?: string;
  /** 请求者（可选） */
  requester?: string;
}

/**
 * 链进度
 */
export interface ChainProgress {
  /** 当前级别索引（从 0 开始） */
  currentLevel: number;
  /** 总级别数 */
  totalLevels: number;
  /** 已完成级别数 */
  completedLevels: number;
  /** 链状态 */
  status: ChainStatus;
}

/**
 * 单个级别的执行结果
 */
export interface LevelResult {
  /** 级别索引 */
  level: number;
  /** 级别名称 */
  name: string;
  /** 该级别是否触发（基于风险等级） */
  triggered: boolean;
  /** 该级别的最终状态 */
  status: ApprovalStatus;
  /** 实际收到的批准数 */
  approvers: string[];
  /** 拒绝原因（若被拒绝） */
  rejectReason?: string;
  /** 关联的审批请求 ID 列表 */
  requestIds: string[];
}

/**
 * 链结果
 */
export interface ChainResult {
  /** 链 ID */
  chainId: string;
  /** 链最终状态 */
  status: ChainStatus;
  /** 各级别执行结果 */
  levels: LevelResult[];
  /** 触发并通过的最终级别名称 */
  approvedAt?: string;
  /** 整体拒绝/超时原因 */
  reason?: string;
  /** 整体时间戳 */
  timestamp: number;
}

/**
 * 链内部状态
 */
interface ChainState {
  id: string;
  levels: ApprovalLevel[];
  status: ChainStatus;
  currentLevel: number;
  completedLevels: number;
  levelResults: LevelResult[];
  startedAt: number;
  finishedAt?: number;
  /** 当前级别下已经创建的 approvalManager 请求 ID 列表 */
  pendingRequestIds: string[];
  /** 等待中 promise 的 resolve/reject */
  resolve?: (result: ChainResult) => void;
  reject?: (error: Error) => void;
  /** 暂停时累积的 resolve 句柄 */
  pausedResolve?: (() => void) | undefined;
}

/** 链配置 */
export interface ApprovalChainConfig {
  /** 注入的 approvalManager（默认使用全局单例） */
  approvalManager?: ApprovalManager;
}

// ===================== 风险等级排序 =====================

const RISK_ORDER: Record<ApprovalRiskLevel, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * 判断是否达到最低风险等级
 */
function meetsRisk(min: ApprovalRiskLevel, current: ApprovalRiskLevel): boolean {
  return RISK_ORDER[current] >= RISK_ORDER[min];
}

// ===================== ApprovalChain 类 =====================

/**
 * 多级审批链
 */
export class ApprovalChain extends EventEmitter {
  private chains: Map<string, ChainState>;
  private manager: ApprovalManager;

  constructor(config?: ApprovalChainConfig) {
    super();
    this.setMaxListeners(100);
    this.chains = new Map();
    this.manager = config?.approvalManager ?? approvalManager;
  }

  // ===================== 链创建 =====================

  /**
   * 创建一个审批链定义
   *
   * @param levels - 级别配置（按顺序）
   * @returns chainId
   */
  createChain(levels: ApprovalLevel[]): string {
    if (!Array.isArray(levels) || levels.length === 0) {
      throw new Error('审批链必须至少包含一个级别');
    }

    for (const level of levels) {
      if (!level.name) {
        throw new Error('每个级别必须有 name');
      }
      if (level.requiredApprovers < 1) {
        throw new Error(`级别 ${level.name} 的 requiredApprovers 必须 >= 1`);
      }
      if (level.timeoutMs < 0) {
        throw new Error(`级别 ${level.name} 的 timeoutMs 不能为负`);
      }
    }

    const id = this.generateId();
    this.chains.set(id, {
      id,
      levels: levels.map((l) => ({ ...l })),
      status: 'pending',
      currentLevel: 0,
      completedLevels: 0,
      levelResults: [],
      startedAt: Date.now(),
      pendingRequestIds: [],
    });

    return id;
  }

  // ===================== 提交审批 =====================

  /**
   * 提交请求到审批链
   *
   * 链按级别顺序执行：
   * 1. 判断当前级别是否触发（基于风险等级）
   * 2. 若触发，向 approvalManager 提交 requiredApprovers 个请求
   * 3. 等待任一请求被批准（达到人数）即通过该级
   * 4. 进入下一级，全部通过则链 approved
   *
   * @param chainId - 链 ID
   * @param request - 审批请求
   * @returns Promise，resolve 时返回链结果
   */
  submit(chainId: string, request: ApprovalRequestPayload): Promise<ChainResult> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      return Promise.reject(new Error(`审批链不存在: ${chainId}`));
    }

    if (chain.status !== 'pending' && chain.status !== 'paused') {
      return Promise.reject(new Error(`审批链 ${chainId} 已处于 ${chain.status} 状态，无法提交`));
    }

    chain.status = 'in_progress';
    this.emit('chain_started', chain);

    return new Promise<ChainResult>((resolve, reject) => {
      chain.resolve = resolve;
      chain.reject = reject;
      this.runChain(chain, request).catch((err) => {
        if (chain.reject) {
          chain.reject(err);
        }
      });
    });
  }

  // ===================== 链控制 =====================

  /**
   * 获取链进度
   */
  getProgress(chainId: string): ChainProgress {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`审批链不存在: ${chainId}`);
    }

    return {
      currentLevel: chain.currentLevel,
      totalLevels: chain.levels.length,
      completedLevels: chain.completedLevels,
      status: chain.status,
    };
  }

  /**
   * 获取链状态（完整信息）
   */
  getChain(chainId: string): ChainState | undefined {
    return this.chains.get(chainId);
  }

  /**
   * 取消审批链
   *
   * 链中所有 pending 的请求也会被取消。
   */
  cancel(chainId: string): void {
    const chain = this.chains.get(chainId);
    if (!chain) return;
    if (chain.status === 'approved' || chain.status === 'rejected' || chain.status === 'timeout' || chain.status === 'cancelled') {
      return;
    }

    // 取消当前所有 pending 请求
    for (const reqId of chain.pendingRequestIds) {
      const req = this.manager.getRequest(reqId);
      if (req && req.status === 'pending') {
        try {
          this.manager.cancelRequest(reqId);
        } catch {
          // 忽略
        }
      }
    }

    this.finalizeChain(chain, 'cancelled', '用户取消审批链');
  }

  /**
   * 暂停审批链
   *
   * 链暂停后，正在等待的请求将继续挂起（不会被取消）。
   * 后续可调用 resume 继续。
   */
  pause(chainId: string): void {
    const chain = this.chains.get(chainId);
    if (!chain) return;
    if (chain.status !== 'in_progress') {
      throw new Error(`链 ${chainId} 不处于 in_progress 状态（当前 ${chain.status}），无法暂停`);
    }
    chain.status = 'paused';
    this.emit('chain_paused', chain);
  }

  /**
   * 恢复审批链
   */
  resume(chainId: string): void {
    const chain = this.chains.get(chainId);
    if (!chain) return;
    if (chain.status !== 'paused') {
      throw new Error(`链 ${chainId} 不处于 paused 状态（当前 ${chain.status}），无法恢复`);
    }
    chain.status = 'in_progress';
    this.emit('chain_resumed', chain);
  }

  /**
   * 清理已完成的链
   */
  cleanup(finishedBeforeMs?: number): number {
    const threshold = finishedBeforeMs ?? Date.now();
    let removed = 0;
    for (const [id, chain] of this.chains) {
      if (
        (chain.status === 'approved' || chain.status === 'rejected' ||
          chain.status === 'timeout' || chain.status === 'cancelled') &&
        chain.finishedAt !== undefined && chain.finishedAt <= threshold
      ) {
        this.chains.delete(id);
        removed++;
      }
    }
    return removed;
  }

  // ===================== 内部：链执行 =====================

  /**
   * 链主循环
   */
  private async runChain(chain: ChainState, request: ApprovalRequestPayload): Promise<void> {
    try {
      for (let i = 0; i < chain.levels.length; i++) {
        // 检查取消
        if (chain.status === 'cancelled') {
          return;
        }

        // 暂停循环：等待 resume
        while (chain.status === 'paused') {
          await sleep(50);
        }

        // 退出暂停后再次检查取消
        if (chain.status as string === 'cancelled') {
          return;
        }

        const level = chain.levels[i];
        chain.currentLevel = i;

        // 判断级别是否触发
        if (!meetsRisk(level.minRiskLevel, request.riskLevel)) {
          chain.levelResults.push({
            level: i,
            name: level.name,
            triggered: false,
            status: 'approved',
            approvers: [],
            requestIds: [],
          });
          chain.completedLevels++;
          continue;
        }

        this.emit('level_started', chain, i, level);

        // 执行该级别
        const result = await this.runLevel(chain, i, level, request);

        chain.levelResults.push(result);
        chain.completedLevels++;

        if (result.status === 'rejected') {
          this.finalizeChain(chain, 'rejected', `级别 ${level.name} 拒绝：${result.rejectReason ?? ''}`);
          return;
        }
        if (result.status === 'timeout') {
          this.finalizeChain(chain, 'timeout', `级别 ${level.name} 超时`);
          return;
        }
        if (result.status === 'cancelled') {
          this.finalizeChain(chain, 'cancelled', `级别 ${level.name} 取消`);
          return;
        }

        this.emit('level_completed', chain, i, result);
      }

      this.finalizeChain(chain, 'approved');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.finalizeChain(chain, 'cancelled', error.message);
      if (chain.reject) {
        chain.reject(error);
      }
    }
  }

  /**
   * 执行单级别审批
   *
   * 在 approvalManager 中创建 requiredApprovers 个请求，
   * 等待其中足够的请求被批准。
   */
  private async runLevel(
    chain: ChainState,
    levelIndex: number,
    level: ApprovalLevel,
    request: ApprovalRequestPayload,
  ): Promise<LevelResult> {
    const requestIds: string[] = [];
    const approvers: string[] = [];

    // 创建该级别的所有请求
    for (let i = 0; i < level.requiredApprovers; i++) {
      const req = this.manager.createRequest(
        request.toolName,
        request.toolArgs,
        request.riskLevel,
        `[${level.name}] ${request.reason}`,
        request.sessionId,
        request.requester,
      );
      requestIds.push(req.id);
    }

    chain.pendingRequestIds = [...requestIds];

    // 收集所有请求的结果
    const promises = requestIds.map((id) => this.manager.waitForApproval(id, level.timeoutMs));

    let timeoutTriggered = false;
    const results = await Promise.allSettled(promises);

    chain.pendingRequestIds = [];

    // 检查超时：若任一结果为 reject（来自 timeout 路径），标记 timeout
    for (const r of results) {
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        if (msg.includes('审批请求不存在') || msg.includes('超时')) {
          timeoutTriggered = true;
        }
      }
    }

    // 也通过审批 manager 状态检查是否有 timeout（更准确）
    for (const id of requestIds) {
      const r = this.manager.getRequest(id);
      if (r && r.status === 'timeout') {
        timeoutTriggered = true;
      }
      if (r && r.status === 'approved' && r.approver) {
        // 检查是否自我批准
        if (!level.allowSelfApprove && r.approver === request.requester) {
          // 视为拒绝
          try {
            this.manager.rejectRequest(id, '不允许自我批准', 'system');
          } catch {
            // 已处理
          }
          return {
            level: levelIndex,
            name: level.name,
            triggered: true,
            status: 'rejected',
            approvers,
            rejectReason: '检测到自我批准',
            requestIds,
          };
        }
        approvers.push(r.approver);
      }
      if (r && r.status === 'rejected') {
        return {
          level: levelIndex,
          name: level.name,
          triggered: true,
          status: 'rejected',
          approvers,
          rejectReason: r.rejectReason,
          requestIds,
        };
      }
      if (r && r.status === 'cancelled') {
        return {
          level: levelIndex,
          name: level.name,
          triggered: true,
          status: 'cancelled',
          approvers,
          requestIds,
        };
      }
    }

    if (timeoutTriggered) {
      return {
        level: levelIndex,
        name: level.name,
        triggered: true,
        status: 'timeout',
        approvers,
        requestIds,
      };
    }

    if (approvers.length >= level.requiredApprovers) {
      return {
        level: levelIndex,
        name: level.name,
        triggered: true,
        status: 'approved',
        approvers,
        requestIds,
      };
    }

    // 默认：未达到批准人数视为超时
    return {
      level: levelIndex,
      name: level.name,
      triggered: true,
      status: 'timeout',
      approvers,
      requestIds,
    };
  }

  /**
   * 终结链
   */
  private finalizeChain(chain: ChainState, status: ChainStatus, reason?: string): void {
    chain.status = status;
    chain.finishedAt = Date.now();

    const result: ChainResult = {
      chainId: chain.id,
      status,
      levels: chain.levelResults,
      reason,
      timestamp: chain.finishedAt,
    };

    if (status === 'approved' && chain.levelResults.length > 0) {
      const last = chain.levelResults[chain.levelResults.length - 1];
      result.approvedAt = last.name;
    }

    this.emit('chain_completed', chain, result);
    if (chain.resolve) {
      chain.resolve(result);
      chain.resolve = undefined;
      chain.reject = undefined;
    }
  }

  // ===================== 工具 =====================

  private generateId(): string {
    return `chain_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===================== 单例导出 =====================

const approvalChain = new ApprovalChain();

export default approvalChain;
