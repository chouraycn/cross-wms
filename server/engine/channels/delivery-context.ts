/**
 * 交付上下文 — 规范化通道路由元数据，用于消息投递
 * 参考 openclaw/src/utils/delivery-context.ts 和 delivery-context.shared.ts
 */

import {
  INTERNAL_MESSAGE_CHANNEL,
  isInternalNonDeliveryChannel,
  normalizeMessageChannel,
  isDeliverableMessageChannel,
} from "./message-channel.js";
import { normalizeOptionalAccountId } from "../infra/account-id.js";

/** 规范化的通道投递目标 */
export type DeliveryContext = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  deliveryIntent?: {
    id: string;
    kind: "outbound_queue";
    queuePolicy?: "required" | "best_effort";
  };
};

/** 会话源字段，用于重建交付上下文 */
export type DeliveryContextSessionSource = {
  route?: {
    channel?: string;
    target?: { to?: string; rawTo?: string; chatType?: string };
    accountId?: string;
    thread?: { id?: string | number; kind?: string; source?: string };
  };
  channel?: string;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  origin?: {
    provider?: string;
    accountId?: string;
    threadId?: string | number;
  };
  deliveryContext?: DeliveryContext;
};

/** 规范化账户 ID */
function normalizeAccountField(value?: string | null): string | undefined {
  return normalizeOptionalAccountId(value);
}

/** 规范化交付上下文 */
export function normalizeDeliveryContext(context?: DeliveryContext): DeliveryContext | undefined {
  if (!context) {
    return undefined;
  }
  const channel = normalizeMessageChannel(context.channel);
  const to = typeof context.to === "string" ? context.to.trim() : undefined;
  const accountId = normalizeAccountField(context.accountId);
  const threadId = context.threadId;

  if (!channel && !to && !accountId) {
    return undefined;
  }

  const normalized: DeliveryContext = {};
  if (channel) {
    normalized.channel = channel;
  }
  if (to) {
    normalized.to = to;
  }
  if (accountId) {
    normalized.accountId = accountId;
  }
  if (threadId !== undefined && threadId !== null && threadId !== "") {
    normalized.threadId = threadId;
  }
  return normalized;
}

/** 合并两个交付上下文，保留优先项 */
export function mergeDeliveryContext(
  primary?: DeliveryContext,
  fallback?: DeliveryContext,
): DeliveryContext | undefined {
  const normalizedPrimary = normalizeDeliveryContext(primary);
  const normalizedFallback = normalizeDeliveryContext(fallback);
  if (!normalizedPrimary && !normalizedFallback) {
    return undefined;
  }
  const channelsConflict =
    normalizedPrimary?.channel &&
    normalizedFallback?.channel &&
    normalizedPrimary.channel !== normalizedFallback.channel;

  return normalizeDeliveryContext({
    channel: normalizedPrimary?.channel ?? normalizedFallback?.channel,
    to: channelsConflict
      ? normalizedPrimary?.to
      : (normalizedPrimary?.to ?? normalizedFallback?.to),
    accountId: channelsConflict
      ? normalizedPrimary?.accountId
      : (normalizedPrimary?.accountId ?? normalizedFallback?.accountId),
    threadId: channelsConflict
      ? normalizedPrimary?.threadId
      : (normalizedPrimary?.threadId ?? normalizedFallback?.threadId),
  });
}

/** 构建交付上下文的紧凑稳定键 */
export function deliveryContextKey(context?: DeliveryContext): string | undefined {
  const normalized = normalizeDeliveryContext(context);
  if (!normalized) {
    return undefined;
  }
  return [normalized.channel ?? "", normalized.to ?? "", normalized.accountId ?? "", String(normalized.threadId ?? "")].join("\0");
}

/** 从会话源派生最佳交付上下文 */
export function deliveryContextFromSession(
  entry?: DeliveryContextSessionSource,
): DeliveryContext | undefined {
  if (!entry) {
    return undefined;
  }
  const legacyContext = normalizeDeliveryContext({
    channel: entry.lastChannel ?? entry.channel,
    to: entry.lastTo,
    accountId: entry.lastAccountId ?? entry.origin?.accountId,
    threadId: entry.lastThreadId ?? entry.origin?.threadId,
  });
  const explicitContext = normalizeDeliveryContext(entry.deliveryContext);
  return mergeDeliveryContext(explicitContext, legacyContext);
}

/** 判断是否为内部路由上下文 */
function isInternalRouteContext(context?: DeliveryContext): boolean {
  const channel = context?.channel;
  return Boolean(
    channel && (channel === INTERNAL_MESSAGE_CHANNEL || isInternalNonDeliveryChannel(channel)),
  );
}

/** 判断是否有外部投递目标 */
function hasExternalDeliveryTarget(context?: DeliveryContext): boolean {
  const channel = normalizeMessageChannel(context?.channel);
  return Boolean(
    channel &&
    !isInternalNonDeliveryChannel(channel) &&
    isDeliverableMessageChannel(channel) &&
    context?.to,
  );
}

/** 规范化会话交付字段，协调遗留字段和新字段 */
export function normalizeSessionDeliveryFields(source?: DeliveryContextSessionSource): {
  deliveryContext?: DeliveryContext;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
} {
  if (!source) {
    return {
      deliveryContext: undefined,
      lastChannel: undefined,
      lastTo: undefined,
      lastAccountId: undefined,
      lastThreadId: undefined,
    };
  }

  const legacyContext = normalizeDeliveryContext({
    channel: source.lastChannel ?? source.channel,
    to: source.lastTo,
    accountId: source.lastAccountId ?? source.origin?.accountId,
    threadId: source.lastThreadId ?? source.origin?.threadId,
  });
  const deliveryContext = normalizeDeliveryContext(source.deliveryContext);

  const sessionContext =
    isInternalRouteContext(legacyContext) && hasExternalDeliveryTarget(deliveryContext)
      ? mergeDeliveryContext(deliveryContext, legacyContext)
      : mergeDeliveryContext(legacyContext, deliveryContext);

  if (!sessionContext) {
    return {
      deliveryContext: undefined,
      lastChannel: undefined,
      lastTo: undefined,
      lastAccountId: undefined,
      lastThreadId: undefined,
    };
  }

  return {
    deliveryContext: sessionContext,
    lastChannel: sessionContext.channel,
    lastTo: sessionContext.to,
    lastAccountId: sessionContext.accountId,
    lastThreadId: sessionContext.threadId,
  };
}