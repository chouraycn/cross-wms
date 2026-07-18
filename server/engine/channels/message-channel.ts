/**
 * 消息通道常量 — 定义内部通道 ID 和路由常量
 * 参考 openclaw/src/utils/message-channel-constants.ts
 */

export const INTERNAL_MESSAGE_CHANNEL = "webchat" as const;
export type InternalMessageChannel = typeof INTERNAL_MESSAGE_CHANNEL;

const INTERNAL_NON_DELIVERY_CHANNELS = [
  "heartbeat",
  "cron",
  "webhook",
  "voice",
  "sessions_send",
] as const;

export function isInternalNonDeliveryChannel(
  value: string,
): value is (typeof INTERNAL_NON_DELIVERY_CHANNELS)[number] {
  return (INTERNAL_NON_DELIVERY_CHANNELS as readonly string[]).includes(value);
}

export const NATIVE_APPROVAL_CHANNELS = [
  "webchat",
  "discord",
  "googlechat",
  "imessage",
  "matrix",
  "qqbot",
  "signal",
  "slack",
  "telegram",
  "whatsapp",
] as const;
export type NativeApprovalChannel = (typeof NATIVE_APPROVAL_CHANNELS)[number];

export function isNativeApprovalChannel(
  value: string | null | undefined,
): value is NativeApprovalChannel {
  if (typeof value !== "string") {
    return false;
  }
  return (NATIVE_APPROVAL_CHANNELS as readonly string[]).includes(value);
}

/** 已知的内置通道 ID 列表 */
export const BUILT_IN_CHANNEL_IDS = [
  "webchat",
  "discord",
  "slack",
  "telegram",
  "whatsapp",
  "imessage",
  "signal",
  "matrix",
  "googlechat",
  "qqbot",
  "tui",
  "cli",
] as const;

/** 规范化通道名称，转为小写并去除空白 */
export function normalizeMessageChannel(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== "string") {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return normalized;
}

/** 判断是否为可投递的非内部通道 */
export function isDeliverableMessageChannel(value: string): boolean {
  const normalized = normalizeMessageChannel(value);
  return (
    normalized !== undefined &&
    normalized !== INTERNAL_MESSAGE_CHANNEL &&
    !isInternalNonDeliveryChannel(normalized) &&
    normalized === value
  );
}

/** 判断是否为内部消息通道 */
export function isInternalMessageChannel(
  raw?: string | null,
): raw is typeof INTERNAL_MESSAGE_CHANNEL {
  return normalizeMessageChannel(raw) === INTERNAL_MESSAGE_CHANNEL;
}

/** 判断通道是否支持 Markdown */
export function isMarkdownCapableMessageChannel(raw?: string | null): boolean {
  const channel = normalizeMessageChannel(raw);
  if (!channel) {
    return false;
  }
  if (channel === INTERNAL_MESSAGE_CHANNEL || channel === "tui" || channel === "cli") {
    return true;
  }
  const markdownChannels = new Set(["webchat", "discord", "slack", "telegram", "matrix", "tui", "cli"]);
  return markdownChannels.has(channel);
}

/** 解析主通道或回退到次通道 */
export function resolveMessageChannel(
  primary?: string | null,
  fallback?: string | null,
): string | undefined {
  return normalizeMessageChannel(primary) ?? normalizeMessageChannel(fallback);
}