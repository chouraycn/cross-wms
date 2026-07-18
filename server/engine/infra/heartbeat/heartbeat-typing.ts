// 移植自 openclaw/src/infra/heartbeat-typing.ts
// 在回复生成期间维护心跳 typing 指示器。
//
// 降级策略：源文件依赖：
//  - ../channels/plugins/types.public.js 的 ChannelHeartbeatDeps、ChannelPlugin 类型
//  - ../channels/typing.js 的 createTypingCallbacks、TypingCallbacks
//  - ../config/types.openclaw.js 的 OpenClawConfig
// cross-wms 未移植这些模块，此处提供降级类型与 stub。
import type { OpenClawConfig } from "../_runtime-stubs.js";

const DEFAULT_HEARTBEAT_TYPING_INTERVAL_SECONDS = 6;

/** Typing 回调类型（降级，源文件来自 ../channels/typing.js） */
export type TypingCallbacks = {
  onReplyStart?: () => Promise<void> | void;
  onReplyEnd?: () => Promise<void> | void;
  onCleanup?: () => Promise<void> | void;
};

/** Channel 心跳依赖（降级类型） */
export type ChannelHeartbeatDeps = Record<string, unknown>;

/** Channel plugin 类型（降级，仅保留心跳用到的字段） */
export type ChannelPlugin = {
  heartbeat?: {
    sendTyping?: (target: unknown) => Promise<void>;
    clearTyping?: (target: unknown) => Promise<void>;
    checkReady?: (params: unknown) => Promise<{ ok: boolean; reason?: string }>;
  };
};

type HeartbeatTypingLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
};

type HeartbeatTypingTarget = {
  channel: string;
  to?: string;
  accountId?: string | null;
  threadId?: string | number | null;
};

/**
 * 为心跳投递目标创建 typing start/stop/keepalive 回调。
 * 降级实现：源文件依赖 ../channels/typing.js 的 createTypingCallbacks。
 * 当无 sendTyping 或 to 时返回 undefined；否则返回仅记录日志的 stub 回调。
 */
export function createHeartbeatTypingCallbacks(params: {
  cfg: OpenClawConfig;
  target: HeartbeatTypingTarget;
  plugin?: Pick<ChannelPlugin, "heartbeat">;
  deps?: ChannelHeartbeatDeps;
  typingIntervalSeconds?: number;
  log?: HeartbeatTypingLogger;
}): TypingCallbacks | undefined {
  const sendTyping = params.plugin?.heartbeat?.sendTyping;
  const to = params.target.to?.trim();
  if (!sendTyping || !to) {
    return undefined;
  }

  const clearTyping = params.plugin?.heartbeat?.clearTyping;
  const keepaliveIntervalMs =
    typeof params.typingIntervalSeconds === "number" && params.typingIntervalSeconds > 0
      ? params.typingIntervalSeconds * 1000
      : DEFAULT_HEARTBEAT_TYPING_INTERVAL_SECONDS * 1000;
  const target = {
    cfg: params.cfg,
    to,
    ...(params.target.accountId !== undefined ? { accountId: params.target.accountId } : {}),
    ...(params.target.threadId !== undefined ? { threadId: params.target.threadId } : {}),
    ...(params.deps ? { deps: params.deps } : {}),
  };

  return {
    ...(keepaliveIntervalMs ? { keepaliveIntervalMs } : {}),
    onReplyStart: async () => {
      try {
        await sendTyping(target);
      } catch (err) {
        params.log?.debug?.(`heartbeat typing failed for ${params.target.channel}`, {
          error: String(err),
          channel: params.target.channel,
          accountId: params.target.accountId,
        });
      }
    },
    ...(clearTyping
      ? {
          onReplyEnd: async () => {
            try {
              await clearTyping(target);
            } catch {
              // 清理错误忽略
            }
          },
        }
      : {}),
    onCleanup: async () => {
      if (clearTyping) {
        try {
          await clearTyping(target);
        } catch {
          // 清理错误忽略
        }
      }
    },
  };
}
