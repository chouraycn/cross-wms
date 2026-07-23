/**
 * 心跳输入状态指示管理
 *
 * 在回复生成期间维护心跳输入状态指示。使用可选的通道心跳钩子在心跳响应生成期间保持输入指示活跃。
 */

const DEFAULT_HEARTBEAT_TYPING_INTERVAL_SECONDS = 6;

export type HeartbeatTypingLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
};

export type HeartbeatTypingTarget = {
  channel: string;
  to?: string;
  accountId?: string | null;
  threadId?: string | number | null;
};

export type TypingCallbacks = {
  onReplyStart?: () => Promise<void>;
  onCleanup?: () => void;
};

/** 为心跳交付目标创建输入开始/停止/保活回调 */
export function createHeartbeatTypingCallbacks(params: {
  target: HeartbeatTypingTarget;
  typingIntervalSeconds?: number;
  log?: HeartbeatTypingLogger;
}): TypingCallbacks | undefined {
  const to = params.target.to?.trim();
  if (!to) {
    return undefined;
  }

  const keepaliveIntervalMs =
    typeof params.typingIntervalSeconds === "number" && params.typingIntervalSeconds > 0
      ? params.typingIntervalSeconds * 1000
      : DEFAULT_HEARTBEAT_TYPING_INTERVAL_SECONDS * 1000;

  let interval: ReturnType<typeof setInterval> | null = null;

  return {
    onReplyStart: async () => {
      params.log?.debug?.(`heartbeat typing started for ${params.target.channel}`, {
        channel: params.target.channel,
        accountId: params.target.accountId,
      });

      if (keepaliveIntervalMs) {
        interval = setInterval(() => {
          params.log?.debug?.(`heartbeat typing keepalive for ${params.target.channel}`);
        }, keepaliveIntervalMs);
        interval.unref?.();
      }
    },
    onCleanup: () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      params.log?.debug?.(`heartbeat typing stopped for ${params.target.channel}`);
    },
  };
}