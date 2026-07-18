// 移植自 openclaw/src/infra/system-run-approval-binding.ts（降级实现）
// system-run 命令与审批的绑定。
import type { ExecApprovalRequest } from "./exec-approvals.js";

export type SystemRunApprovalBinding = {
  approvalId: string;
  commandText: string;
  argv: string[];
  boundAtMs: number;
};

export type SystemRunApprovalPlan = {
  commandText: string;
  commandPreview?: string | null;
  argv: string[];
  requiresApproval: boolean;
};

/**
 * 绑定 system-run 命令到审批请求。
 * 降级实现：返回 null。
 */
export function bindSystemRunApproval(_params: {
  commandText: string;
  argv: string[];
  approvalId: string;
}): SystemRunApprovalBinding | null {
  return null;
}

/**
 * 解析 system-run 审批计划。
 * 降级实现：requiresApproval 始终为 true。
 */
export function resolveSystemRunApprovalPlan(params: {
  commandText: string;
  argv: string[];
  commandPreview?: string | null;
}): SystemRunApprovalPlan {
  return {
    commandText: params.commandText,
    commandPreview: params.commandPreview ?? null,
    argv: params.argv,
    requiresApproval: true,
  };
}

/** 从审批请求解析 system-run 计划（降级：返回 undefined） */
export function resolveSystemRunPlanFromApproval(_request: ExecApprovalRequest): SystemRunApprovalPlan | undefined {
  return undefined;
}

export type { ExecApprovalRequest };
