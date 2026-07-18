// 移植自 openclaw/src/infra/exec-approval-forwarder.runtime.ts（降级实现）
// exec 审批转发器的运行时实现。
import type { ExecApprovalForwarder } from "./exec-approval-forwarder.js";
import type { ExecApprovalRequest, ExecApprovalResolved } from "./exec-approvals.js";

export type { ExecApprovalForwarder };

/**
 * 创建带运行时状态的 exec 审批转发器。
 * 降级实现：返回 noop 转发器。
 */
export function createExecApprovalForwarderRuntime(_options?: {
  cfg?: unknown;
}): ExecApprovalForwarder {
  return {
    start: async () => {},
    stop: async () => {},
    forwardRequested: async (_request: ExecApprovalRequest) => {},
    forwardResolved: async (_resolved: ExecApprovalResolved) => {},
    forwardExpired: async (_approvalId: string) => {},
  };
}

/** 启动转发器并监听审批事件（降级：noop） */
export async function startExecApprovalForwarder(_forwarder: ExecApprovalForwarder): Promise<void> {
  await _forwarder.start();
}

/** 停止转发器（降级：noop） */
export async function stopExecApprovalForwarder(_forwarder: ExecApprovalForwarder): Promise<void> {
  await _forwarder.stop();
}
