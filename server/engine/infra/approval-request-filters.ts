// 移植自 openclaw/src/infra/approval-request-filters.ts（降级实现）
// 审批请求过滤器。
import type { ApprovalRequest } from "./approval-handler-runtime-types.js";

export type ApprovalRequestFilter = (
  request: ApprovalRequest,
) => boolean;

/** 创建通道过滤器 */
export function createChannelFilter(channel: string): ApprovalRequestFilter {
  return (request) => {
    const req = request.request as { turnSourceChannel?: string | null };
    return req.turnSourceChannel === channel;
  };
}

/** 创建 agent 过滤器 */
export function createAgentFilter(agentId: string): ApprovalRequestFilter {
  return (request) => {
    const req = request.request as { agentId?: string | null };
    return req.agentId === agentId;
  };
}

/** 创建会话过滤器 */
export function createSessionFilter(sessionKey: string): ApprovalRequestFilter {
  return (request) => {
    const req = request.request as { sessionKey?: string | null };
    return req.sessionKey === sessionKey;
  };
}

/** 组合多个过滤器（AND 逻辑） */
export function combineApprovalRequestFilters(
  filters: readonly ApprovalRequestFilter[],
): ApprovalRequestFilter {
  return (request) => filters.every((filter) => filter(request));
}

/** 过滤审批请求列表 */
export function filterApprovalRequests(
  requests: readonly ApprovalRequest[],
  filter: ApprovalRequestFilter,
): ApprovalRequest[] {
  return requests.filter(filter);
}

export type { ApprovalRequest };
