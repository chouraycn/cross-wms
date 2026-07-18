/**
 * Exec Approvals Gateway Methods — 执行审批 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/exec-approvals.ts
 * - 精简版：只实现 list / approve / deny / getPolicy 四个核心方法
 * - 与 cross-wms 已有的 server/engine/execApprovalManager.ts 集成
 *   （通过 server/engine/execApprovals.ts 的高层封装调用 ExecApprovalManager）
 */

import type { GatewayMethodContext } from './types.js';
import type { ExecApprovalRule } from '../engine/execApprovals.js';
import { getMethodRegistry } from './methodRegistry.js';
import {
  approveExecRequest,
  denyExecRequest,
  getApprovalRules,
  listPendingApprovals,
  addApprovalRule,
  removeApprovalRule,
} from '../engine/execApprovals.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// ========== Exec Approvals List ==========

async function execApprovalsList(_params: unknown, _ctx: GatewayMethodContext) {
  const pending = listPendingApprovals();

  return {
    ok: true,
    pending,
    total: pending.length,
  };
}

// ========== Exec Approvals Approve ==========

async function execApprovalsApprove(params: unknown, _ctx: GatewayMethodContext) {
  const { approvalId, resolvedBy } = params as {
    approvalId: string;
    resolvedBy?: string;
  };

  if (!approvalId) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'approvalId is required' } };
  }

  const approved = await approveExecRequest(approvalId);

  if (!approved) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `Approval ${approvalId} not found or already resolved` },
    };
  }

  return {
    ok: true,
    approvalId,
    decision: 'approve' as const,
    resolvedBy: resolvedBy ?? null,
  };
}

// ========== Exec Approvals Deny ==========

async function execApprovalsDeny(params: unknown, _ctx: GatewayMethodContext) {
  const { approvalId, resolvedBy } = params as {
    approvalId: string;
    resolvedBy?: string;
  };

  if (!approvalId) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'approvalId is required' } };
  }

  const denied = await denyExecRequest(approvalId);

  if (!denied) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `Approval ${approvalId} not found or already resolved` },
    };
  }

  return {
    ok: true,
    approvalId,
    decision: 'deny' as const,
    resolvedBy: resolvedBy ?? null,
  };
}

// ========== Exec Approvals Get Policy ==========

async function execApprovalsGetPolicy(params: unknown, _ctx: GatewayMethodContext) {
  const { action = 'get' } = params as {
    action?: 'get' | 'add' | 'remove';
    rule?: ExecApprovalRule;
    ruleId?: string;
  };

  if (action === 'add') {
    const { rule } = params as { rule?: ExecApprovalRule };
    if (!rule) {
      return { ok: false, error: { code: 'MISSING_PARAMS', message: 'rule is required for add action' } };
    }
    addApprovalRule(rule);
    return {
      ok: true,
      rules: getApprovalRules(),
    };
  }

  if (action === 'remove') {
    const { ruleId } = params as { ruleId?: string };
    if (!ruleId) {
      return { ok: false, error: { code: 'MISSING_PARAMS', message: 'ruleId is required for remove action' } };
    }
    removeApprovalRule(ruleId);
    return {
      ok: true,
      rules: getApprovalRules(),
    };
  }

  // 默认 action === 'get'
  return {
    ok: true,
    rules: getApprovalRules(),
  };
}

/**
 * 注册所有执行审批方法
 */
export function registerExecApprovalsMethods(registry: GatewayMethodRegistry): void {
  registry.register('execApprovals.list', execApprovalsList);
  registry.register('execApprovals.approve', execApprovalsApprove);
  registry.register('execApprovals.deny', execApprovalsDeny);
  registry.register('execApprovals.getPolicy', execApprovalsGetPolicy);
}
