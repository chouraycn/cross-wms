// Channel status patch 工厂集中了多个运行时路径发送到 gateway status store 的时间戳字段。
// 移植自 openclaw/src/gateway/channel-status-patches.ts（纯类型与工厂函数，无外部依赖）。

/** 当 channel 连接建立时发射的 patch。 */
export type ConnectedChannelStatusPatch = {
  connected: true;
  lastConnectedAt: number;
  lastEventAt: number;
};

/** 当 channel transport 报告活动（未重连）时发射的 patch。 */
export type TransportActivityChannelStatusPatch = {
  lastTransportActivityAt: number;
};

/** 创建一个带匹配连接/事件时间戳的 connected-channel status patch。 */
export function createConnectedChannelStatusPatch(
  at: number = Date.now(),
): ConnectedChannelStatusPatch {
  return {
    connected: true,
    lastConnectedAt: at,
    lastEventAt: at,
  };
}

/** 为 health/activity 监视器创建一个 transport-activity patch。 */
export function createTransportActivityStatusPatch(
  at: number = Date.now(),
): TransportActivityChannelStatusPatch {
  return {
    lastTransportActivityAt: at,
  };
}
