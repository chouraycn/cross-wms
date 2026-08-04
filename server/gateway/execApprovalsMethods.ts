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
import { getWebSocketHub } from './webSocketHub.js';
import { GATEWAY_EVENT_TYPES } from './gatewayEventTypes.js';
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

  // 广播 exec.approval.requested 事件，通知 WS 客户端有待审批请求
  // （每次 list 调用都会推送当前 pending 列表，客户端可据此触发审批 UI）
  const hub = getWebSocketHub();
  const requestedAt = Date.now();
  for (const approval of pending) {
    hub.broadcastEvent(GATEWAY_EVENT_TYPES.EXEC_APPROVAL_REQUESTED, {
      approvalId: approval.requestId,
      kind: 'exec' as const,
      title: approval.command,
      description: `exec approval request for: ${approval.command}`,
      sessionKey: approval.sessionId,
      agentId: approval.agentId,
      toolName: approval.skillName,
      requestedAt,
    });
  }

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

  // 广播 exec.approval.resolved 事件（decision=approve）
  getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.EXEC_APPROVAL_RESOLVED, {
    approvalId,
    kind: 'exec' as const,
    decision: 'approve' as const,
    resolvedBy: resolvedBy ?? null,
    resolvedAt: Date.now(),
  });

  return {
    ok: true,
    approvalId,
    decision: 'approve' as const,
    resolvedBy: resolvedBy ?? null,
  };
}

// ========== Exec Approvals Deny ==========

async function execApprovalsDeny(params: unknown, _ctx: GatewayMethodContext) {
  const { approvalId, resolvedBy, reason } = params as {
    approvalId: string;
    resolvedBy?: string;
    reason?: string;
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

  // 广播 exec.approval.resolved 事件（decision=deny）
  getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.EXEC_APPROVAL_RESOLVED, {
    approvalId,
    kind: 'exec' as const,
    decision: 'deny' as const,
    resolvedBy: resolvedBy ?? null,
    resolvedAt: Date.now(),
    ...(reason ? { reason } : {}),
  });

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

  // 命名对齐别名：exec.approvals.* 与 execApprovals.* 等价
  registry.register('exec.approvals.list', execApprovalsList);
  registry.register('exec.approvals.approve', execApprovalsApprove);
  registry.register('exec.approvals.deny', execApprovalsDeny);
  registry.register('exec.approvals.getPolicy', execApprovalsGetPolicy);
}
