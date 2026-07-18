/**
 * Plugin Approval Gateway Methods — 插件审批 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/plugin-approval.ts
 * - 精简版：只实现 list / approve / deny 三个核心方法
 * - 使用 server/engine/execApprovalManager.ts 提供的 ExecApprovalManager
 *   为插件审批请求维护独立的审批队列
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { ExecApprovalManager } from '../engine/execApprovalManager.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

export interface PluginApprovalRequestPayload {
  pluginId: string;
  title: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
  toolName?: string;
  toolCallId?: string;
  agentId?: string;
  sessionKey?: string;
}

// 插件审批独立的审批管理器实例（与执行审批队列隔离）
const pluginApprovalManager = new ExecApprovalManager<PluginApprovalRequestPayload>();

// ========== Plugin Approval List ==========

async function pluginApprovalList(_params: unknown, _ctx: GatewayMethodContext) {
  const pending = pluginApprovalManager.listPending();

  return {
    ok: true,
    pending,
    total: pending.length,
  };
}

// ========== Plugin Approval Approve ==========

async function pluginApprovalApprove(params: unknown, _ctx: GatewayMethodContext) {
  const { approvalId, resolvedBy } = params as {
    approvalId: string;
    resolvedBy?: string;
  };

  if (!approvalId) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'approvalId is required' } };
  }

  const exists = pluginApprovalManager.hasPending(approvalId);
  if (!exists) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `Plugin approval ${approvalId} not found or already resolved` },
    };
  }

  pluginApprovalManager.resolve(approvalId, 'approve', resolvedBy);

  return {
    ok: true,
    approvalId,
    decision: 'approve' as const,
    resolvedBy: resolvedBy ?? null,
  };
}

// ========== Plugin Approval Deny ==========

async function pluginApprovalDeny(params: unknown, _ctx: GatewayMethodContext) {
  const { approvalId, resolvedBy } = params as {
    approvalId: string;
    resolvedBy?: string;
  };

  if (!approvalId) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'approvalId is required' } };
  }

  const exists = pluginApprovalManager.hasPending(approvalId);
  if (!exists) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `Plugin approval ${approvalId} not found or already resolved` },
    };
  }

  pluginApprovalManager.resolve(approvalId, 'reject', resolvedBy);

  return {
    ok: true,
    approvalId,
    decision: 'deny' as const,
    resolvedBy: resolvedBy ?? null,
  };
}

/**
 * 注册所有插件审批方法
 */
export function registerPluginApprovalMethods(registry: GatewayMethodRegistry): void {
  registry.register('pluginApproval.list', pluginApprovalList);
  registry.register('pluginApproval.approve', pluginApprovalApprove);
  registry.register('pluginApproval.deny', pluginApprovalDeny);
}
