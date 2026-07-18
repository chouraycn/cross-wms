// 移植自 openclaw/src/infra/exec-approval-forwarder.ts（降级实现）
// 将 exec 审批请求转发到 native 客户端并处理决议。
//
// 降级策略：源文件依赖 ../auto-reply/types.js、../interactive/payload.js、../channels/plugins/index.js、
// ./exec-approval-reply.js、./exec-approval-surface.js 等模块。这里提供降级的类型与函数。
import type { ExecApprovalRequest, ExecApprovalResolved } from "./exec-approvals.js";

export type ExecApprovalForwarder = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  forwardRequested: (request: ExecApprovalRequest) => Promise<void>;
  forwardResolved: (resolved: ExecApprovalResolved) => Promise<void>;
  forwardExpired: (approvalId: string) => Promise<void>;
};

export function buildExecApprovalRequestMessage(
  request: ExecApprovalRequest,
  nowMs: number,
): string {
  return `Exec approval request ${request.id} (created: ${new Date(request.createdAtMs).toISOString()}, now: ${new Date(nowMs).toISOString()})`;
}

export function createExecApprovalForwarder(_options?: {
  cfg?: unknown;
}): ExecApprovalForwarder {
  const noop = async () => {};
  return {
    start: noop,
    stop: noop,
    forwardRequested: noop,
    forwardResolved: noop,
    forwardExpired: noop,
  };
}
