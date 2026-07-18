// 移植自 openclaw/src/infra/approval-native-route-notice.ts（降级实现）
// channel-native 审批路由通知。
import type { ApprovalRequest } from "./approval-handler-runtime-types.js";

export type ApprovalRouteNotice = {
  kind: "pending" | "resolved" | "expired" | "error";
  message: string;
  request: ApprovalRequest;
  timestampMs: number;
};

/**
 * 构建 pending 路由通知。
 */
export function buildPendingRouteNotice(params: {
  request: ApprovalRequest;
  channel?: string;
}): ApprovalRouteNotice {
  return {
    kind: "pending",
    message: `Approval pending for ${params.channel ?? "unknown channel"}`,
    request: params.request,
    timestampMs: Date.now(),
  };
}

/** 构建 resolved 路由通知 */
export function buildResolvedRouteNotice(params: {
  request: ApprovalRequest;
  decision: "allow-once" | "allow-always" | "deny";
}): ApprovalRouteNotice {
  return {
    kind: "resolved",
    message: `Approval ${params.decision}`,
    request: params.request,
    timestampMs: Date.now(),
  };
}

/** 构建 expired 路由通知 */
export function buildExpiredRouteNotice(params: { request: ApprovalRequest }): ApprovalRouteNotice {
  return {
    kind: "expired",
    message: "Approval expired",
    request: params.request,
    timestampMs: Date.now(),
  };
}

/** 构建 error 路由通知 */
export function buildErrorRouteNotice(params: {
  request: ApprovalRequest;
  error: Error;
}): ApprovalRouteNotice {
  return {
    kind: "error",
    message: params.error.message,
    request: params.request,
    timestampMs: Date.now(),
  };
}

export type { ApprovalRequest };
