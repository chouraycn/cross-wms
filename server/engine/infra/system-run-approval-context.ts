// 移植自 openclaw/src/infra/system-run-approval-context.ts（降级实现）
// system-run 审批上下文。
import type { OpenClawConfig } from "./_runtime-stubs.js";

export type SystemRunApprovalContext = {
  cfg?: OpenClawConfig;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
  agentId?: string;
  sessionKey?: string;
};

/**
 * 解析 system-run 审批上下文。
 * 降级实现：直接透传参数。
 */
export function resolveSystemRunApprovalContext(params: {
  cfg?: OpenClawConfig;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
  agentId?: string;
  sessionKey?: string;
}): SystemRunApprovalContext {
  return {
    cfg: params.cfg,
    cwd: params.cwd,
    env: params.env,
    platform: params.platform,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
  };
}

/** 检查 system-run 审批上下文是否有效 */
export function isSystemRunApprovalContextValid(context: SystemRunApprovalContext): boolean {
  return Boolean(context.cwd);
}

export type { OpenClawConfig };
