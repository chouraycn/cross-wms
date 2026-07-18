// 移植自 openclaw/src/infra/approval-native-route-coordinator.ts（降级实现）
// channel-native 审批路由协调器。
import type { ApprovalRequest } from "./approval-handler-runtime-types.js";
import type { ChannelApprovalNativePlannedTarget } from "./approval-native-delivery.js";

export type ApprovalRouteCoordinator = {
  resolveRoute: (request: ApprovalRequest) => ChannelApprovalNativePlannedTarget | null;
  registerRoute: (channel: string, resolver: (request: ApprovalRequest) => ChannelApprovalNativePlannedTarget | null) => void;
};

/**
 * 创建审批路由协调器。
 * 降级实现：始终返回 null。
 */
export function createApprovalRouteCoordinator(): ApprovalRouteCoordinator {
  const routes = new Map<string, (request: ApprovalRequest) => ChannelApprovalNativePlannedTarget | null>();
  return {
    resolveRoute: (request) => {
      for (const resolver of routes.values()) {
        const target = resolver(request);
        if (target) return target;
      }
      return null;
    },
    registerRoute: (channel, resolver) => {
      routes.set(channel, resolver);
    },
  };
}

export type { ApprovalRequest, ChannelApprovalNativePlannedTarget };
