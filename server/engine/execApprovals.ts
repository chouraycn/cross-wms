/**
 * 执行审批决策引擎 — 参考 OpenClaw infra/exec-approvals.ts
 *
 * 管理命令执行的审批流程，支持自动允许、需要审批、拒绝等决策。
 * 集成技能级权限检查，确保只有授权用户才能执行特定技能的命令。
 */

import { logger } from '../logger.js';
import { ExecApprovalManager } from './execApprovalManager.js';
import {
  checkSkillPermission,
  type SkillPermissionAction,
  type PermissionCheckResult,
  initDefaultPermissions,
} from './skills/security/permission.js';

export type ExecApprovalDecision = 'allow' | 'deny' | 'require_approval';

export interface ExecApprovalRequest {
  requestId: string;
  nodeId: string;
  command: string;
  args: string[];
  sessionId?: string;
  agentId?: string;
  timestamp: number;
  skillName?: string;
  userRole?: string;
}

export interface ExecApprovalResult {
  decision: ExecApprovalDecision;
  reason?: string;
  approvalId?: string;
  expiresAt?: number;
}

export interface ExecApprovalRule {
  id: string;
  pattern: string;
  decision: ExecApprovalDecision;
  description?: string;
  priority: number;
}

const approvalManager = new ExecApprovalManager<ExecApprovalRequest>();

const defaultRules: ExecApprovalRule[] = [
  { id: 'safe-bins', pattern: '/usr/bin/ls|/usr/bin/cat|/usr/bin/echo', decision: 'allow', priority: 100 },
  { id: 'dangerous', pattern: 'rm -rf|sudo|shutdown', decision: 'deny', priority: 50 },
  { id: 'network', pattern: 'curl|wget|git clone', decision: 'require_approval', priority: 75 },
  { id: 'default', pattern: '.*', decision: 'require_approval', priority: 0 },
];

initDefaultPermissions();

function checkSkillExecutionPermission(skillName?: string, userRole?: string): PermissionCheckResult | null {
  if (!skillName || !userRole) {
    return null;
  }

  return checkSkillPermission(skillName, 'execute', userRole);
}

export async function evaluateExecApproval(request: Omit<ExecApprovalRequest, 'requestId' | 'timestamp'>): Promise<ExecApprovalResult> {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const fullRequest: ExecApprovalRequest = {
    ...request,
    requestId,
    timestamp: Date.now(),
  };

  logger.info(`[ExecApproval] 评估审批: ${request.command}${request.skillName ? ` (技能: ${request.skillName})` : ''}`);

  const permissionCheck = checkSkillExecutionPermission(request.skillName, request.userRole);
  if (permissionCheck && !permissionCheck.allowed) {
    logger.warn(`[ExecApproval] 技能权限拒绝: ${request.skillName} (角色: ${request.userRole})`);
    return {
      decision: 'deny',
      reason: permissionCheck.reason,
    };
  }

  const rule = findMatchingRule(request.command);

  if (rule.decision === 'allow') {
    logger.info(`[ExecApproval] 自动允许: ${request.command} (规则: ${rule.id})`);
    return {
      decision: 'allow',
      reason: `匹配规则: ${rule.id}`,
    };
  }

  if (rule.decision === 'deny') {
    logger.warn(`[ExecApproval] 拒绝: ${request.command} (规则: ${rule.id})`);
    return {
      decision: 'deny',
      reason: `匹配规则: ${rule.id}`,
    };
  }

  const approval = approvalManager.create(fullRequest);

  logger.info(`[ExecApproval] 需要审批: ${request.command} (approvalId: ${approval.id})`);

  return {
    decision: 'require_approval',
    reason: `匹配规则: ${rule.id}`,
    approvalId: approval.id,
    expiresAt: approval.expiresAtMs,
  };
}

function findMatchingRule(command: string): ExecApprovalRule {
  const sortedRules = [...defaultRules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (new RegExp(rule.pattern).test(command)) {
      return rule;
    }
  }

  return sortedRules[sortedRules.length - 1];
}

export async function approveExecRequest(approvalId: string): Promise<boolean> {
  try {
    approvalManager.resolve(approvalId, 'approve');
    logger.info(`[ExecApproval] 审批通过: ${approvalId}`);
    return true;
  } catch {
    return false;
  }
}

export async function denyExecRequest(approvalId: string): Promise<boolean> {
  try {
    approvalManager.resolve(approvalId, 'reject');
    logger.info(`[ExecApproval] 审批拒绝: ${approvalId}`);
    return true;
  } catch {
    return false;
  }
}

export async function cancelExecRequest(approvalId: string): Promise<boolean> {
  try {
    approvalManager.cancel(approvalId);
    logger.info(`[ExecApproval] 取消审批: ${approvalId}`);
    return true;
  } catch {
    return false;
  }
}

export function getPendingApproval(approvalId: string): ExecApprovalRequest | undefined {
  const approval = approvalManager.get(approvalId);
  return approval?.request;
}

export function listPendingApprovals(): ExecApprovalRequest[] {
  return approvalManager.listPending().map((a) => a.request);
}

export function addApprovalRule(rule: ExecApprovalRule): void {
  defaultRules.push(rule);
  logger.info(`[ExecApproval] 添加规则: ${rule.id}`);
}

export function removeApprovalRule(ruleId: string): void {
  const index = defaultRules.findIndex((r) => r.id === ruleId);
  if (index >= 0) {
    defaultRules.splice(index, 1);
    logger.info(`[ExecApproval] 删除规则: ${ruleId}`);
  }
}

export function getApprovalRules(): ExecApprovalRule[] {
  return [...defaultRules];
}