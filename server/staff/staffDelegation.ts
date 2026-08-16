/**
 * staffDelegation — 员工互相派活服务（P2b）
 *
 * 对标 DSH subagent 的"委托深度 + 父授权 + 持久 descriptor"三件套，落地在 staff 层：
 * - 委托深度：create 时 depth = 父员工当前最深进行中派活 + 1，超过
 *   guardConfig.maxDelegationDepth（默认 3）拒绝（DEPTH_EXCEEDED）。
 * - 父授权：仅记录的直接父员工可 complete/fail/block 该派活（UNAUTHORIZED 拒绝）。
 * - 持久 descriptor：sd_delegations 行 = 派活事实；每次变更写父会话账本
 *   delegation.change 事件（可审计）。
 */

import { getGuardConfig } from '../engine/guardConfig.js';
import { recordDelegationChanged } from '../engine/eventRecorder.js';
import {
  createDelegation,
  getDelegationById,
  listDelegations,
  maxActiveDepthOfParent,
  updateDelegationStatus,
  type DelegationRow,
  type DelegationStatus,
} from '../dao/staffDelegationDao.js';
import { newStaffId, StaffIdPrefix } from '../db-staff.js';

export class DelegationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DelegationError';
    this.code = code;
  }
}

// ===================== 纯逻辑（可单测） =====================

/** 子委托深度 = 父员工当前最深进行中派活 + 1 */
export function computeDelegationDepth(parentMaxActiveDepth: number): number {
  return parentMaxActiveDepth + 1;
}

/** 校验深度是否在允许范围内（maxDepth 缺省取 guardConfig） */
export function assertDepthAllowed(depth: number, maxDepth?: number): void {
  const limit = maxDepth ?? getGuardConfig().maxDelegationDepth;
  if (depth > limit) {
    throw new DelegationError('DEPTH_EXCEEDED', `委托深度 ${depth} 超过上限 ${limit}（防止员工递归派活失控）`);
  }
}

/** 父授权校验：仅记录的直接父员工可操作该派活 */
export function assertParentAuthorized(
  delegation: Pick<DelegationRow, 'tenant_id' | 'parent_agent_id'>,
  tenantId: string,
  parentAgentId: string,
): void {
  if (delegation.tenant_id !== tenantId || delegation.parent_agent_id !== parentAgentId) {
    throw new DelegationError('UNAUTHORIZED', `员工 ${parentAgentId} 无权操作该派活（仅直接父员工 ${delegation.parent_agent_id} 可操作）`);
  }
}

/** 终态校验：completed/failed 不可再迁移 */
export function assertNotTerminal(delegation: Pick<DelegationRow, 'status'>): void {
  if (delegation.status === 'completed' || delegation.status === 'failed') {
    throw new DelegationError('TERMINAL', `派活已处于终态 ${delegation.status}，不可再变更`);
  }
}

// ===================== 服务 =====================

export interface CreateStaffDelegationInput {
  tenantId: string;
  parentAgentId: string;
  childAgentId: string;
  parentSessionId: string;
  taskDescription: string;
}

export const staffDelegationService = {
  /**
   * 创建派活：计算深度 → 校验上限 → 写 sd_delegations（持久 descriptor）→ 记父会话账本。
   */
  async create(input: CreateStaffDelegationInput): Promise<DelegationRow> {
    const parentMax = maxActiveDepthOfParent(input.tenantId, input.parentAgentId);
    const depth = computeDelegationDepth(parentMax);
    assertDepthAllowed(depth);

    const id = newStaffId(StaffIdPrefix.delegation);
    const row = createDelegation({
      id,
      tenantId: input.tenantId,
      parentAgentId: input.parentAgentId,
      childAgentId: input.childAgentId,
      parentSessionId: input.parentSessionId,
      taskDescription: input.taskDescription.trim(),
      depth,
    });
    if (!row.task_description) {
      // 防御：空任务描述不允许
      updateDelegationStatus(input.tenantId, id, 'failed', { error: 'task_description 为空' });
      throw new DelegationError('BAD_REQUEST', 'taskDescription 不能为空');
    }
    await Promise.resolve(
      recordDelegationChanged(input.parentSessionId, {
        delegationId: id,
        tenantId: input.tenantId,
        parentAgentId: input.parentAgentId,
        childAgentId: input.childAgentId,
        depth,
        status: 'pending',
      }),
    ).catch(() => undefined);
    return row;
  },

  list(tenantId: string, filter: { status?: DelegationStatus; agentId?: string } = {}): DelegationRow[] {
    return listDelegations(tenantId, filter);
  },

  /**
   * 状态迁移（父授权 + 非终态校验）。绑定子会话（active 时）或失败原因。
   */
  async transition(
    tenantId: string,
    parentAgentId: string,
    delegationId: string,
    status: 'active' | 'blocked' | 'completed' | 'failed',
    patch: { childSessionId?: string; error?: string } = {},
  ): Promise<DelegationRow> {
    const delegation = getDelegationById(tenantId, delegationId);
    if (!delegation) throw new DelegationError('NOT_FOUND', `派活 ${delegationId} 不存在`);
    assertParentAuthorized(delegation, tenantId, parentAgentId);
    assertNotTerminal(delegation);

    const updated = updateDelegationStatus(tenantId, delegationId, status, patch);
    if (!updated) throw new DelegationError('NOT_FOUND', `派活 ${delegationId} 不存在`);
    await Promise.resolve(
      recordDelegationChanged(delegation.parent_session_id, {
        delegationId,
        tenantId,
        parentAgentId: delegation.parent_agent_id,
        childAgentId: delegation.child_agent_id,
        depth: delegation.depth,
        status,
        error: patch.error,
      }),
    ).catch(() => undefined);
    return updated;
  },
};
