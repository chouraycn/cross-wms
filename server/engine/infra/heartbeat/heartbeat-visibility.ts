// 移植自 openclaw/src/infra/heartbeat-visibility.ts
// 解析跨配置优先级层的心跳可见性开关。
//
// 降级策略：源文件依赖：
//  - ../config/types.channels.js 的 ChannelHeartbeatVisibilityConfig 类型
//  - ../config/types.openclaw.js 的 OpenClawConfig 类型
//  - ../utils/message-channel.js 的 GatewayMessageChannel 类型
// cross-wms 未移植这些模块，此处提供降级类型并保留完整优先级逻辑。
import type { OpenClawConfig } from "../_runtime-stubs.js";

/** Channel 心跳可见性配置（降级类型） */
export type ChannelHeartbeatVisibilityConfig = {
  showOk?: boolean;
  showAlerts?: boolean;
  useIndicator?: boolean;
};

/** Gateway 消息 channel 类型（降级，源文件来自 ../utils/message-channel.js） */
export type GatewayMessageChannel = string;

/** 解析后的心跳呈现开关（应用 defaults/channel/account 优先级后）。 */
export type ResolvedHeartbeatVisibility = {
  /** 是否将成功的心跳内容作为可见聊天文本发送。 */
  showOk: boolean;
  /** 是否将警告/错误的心跳内容作为可见聊天文本发送。 */
  showAlerts: boolean;
  /** 是否为 UI 表面发出指示器事件。 */
  useIndicator: boolean;
};

const DEFAULT_VISIBILITY: ResolvedHeartbeatVisibility = {
  showOk: false, // 默认静默
  showAlerts: true, // 显示内容消息
  useIndicator: true, // 发出指示器事件
};

/**
 * 解析某个 channel 的心跳可见性，应用 account > channel > defaults 优先级。
 */
export function resolveHeartbeatVisibility(params: {
  cfg: OpenClawConfig;
  channel: GatewayMessageChannel;
  accountId?: string;
}): ResolvedHeartbeatVisibility {
  const { cfg, channel, accountId } = params;

  // Webchat 没有 channel/account 配置分支，因此仅共享的 channel defaults 适用。
  if (channel === "webchat") {
    const channelsCfg = cfg.channels as
      | { defaults?: { heartbeat?: ChannelHeartbeatVisibilityConfig } }
      | undefined;
    const channelDefaults = channelsCfg?.defaults?.heartbeat;
    return {
      showOk: channelDefaults?.showOk ?? DEFAULT_VISIBILITY.showOk,
      showAlerts: channelDefaults?.showAlerts ?? DEFAULT_VISIBILITY.showAlerts,
      useIndicator: channelDefaults?.useIndicator ?? DEFAULT_VISIBILITY.useIndicator,
    };
  }

  // 第一层：全局 channel defaults
  const channelsCfg = cfg.channels as
    | {
        defaults?: { heartbeat?: ChannelHeartbeatVisibilityConfig };
      }
    | undefined;
  const channelDefaults = channelsCfg?.defaults?.heartbeat;

  // 第二层：Per-channel 配置（在 channel 根级别）
  const channelCfg = (cfg.channels as Record<string, unknown> | undefined)?.[channel] as
    | {
        heartbeat?: ChannelHeartbeatVisibilityConfig;
        accounts?: Record<string, { heartbeat?: ChannelHeartbeatVisibilityConfig }>;
      }
    | undefined;
  const perChannel = channelCfg?.heartbeat;

  // 第三层：Per-account 配置（最具体）
  const accountCfg = accountId ? channelCfg?.accounts?.[accountId] : undefined;
  const perAccount = accountCfg?.heartbeat;

  return {
    showOk:
      perAccount?.showOk ??
      perChannel?.showOk ??
      channelDefaults?.showOk ??
      DEFAULT_VISIBILITY.showOk,
    showAlerts:
      perAccount?.showAlerts ??
      perChannel?.showAlerts ??
      channelDefaults?.showAlerts ??
      DEFAULT_VISIBILITY.showAlerts,
    useIndicator:
      perAccount?.useIndicator ??
      perChannel?.useIndicator ??
      channelDefaults?.useIndicator ??
      DEFAULT_VISIBILITY.useIndicator,
  };
}
