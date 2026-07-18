/**
 * Route projection helpers between sessions, delivery context, and channel routes.
 * 移植自 openclaw/src/channels/route-projection.ts
 *
 * 降级策略：
 *  - ../infra/outbound/session-binding-service.js (ConversationRef, SessionBindingRecord) →
 *    ./_openclaw-stubs.js
 *  - ../plugin-sdk/channel-route.js (normalizeChannelRouteRef, ChannelRouteRef) →
 *    ./_openclaw-stubs.js
 *  - ../utils/conversation-target.js (normalizeConversationTargetParams,
 *    ConversationTargetParams) → cross-wms ./conversation-target.js（已有实现）
 *  - ../utils/delivery-context.shared.js (deliveryContextFromChannelRoute, DeliveryContext) →
 *    cross-wms ./delivery-context.js（已有实现）
 *  - ./plugins/registry.js (getChannelPlugin, normalizeChannelId) → ./_openclaw-stubs.js
 */
import {
  normalizeChannelRouteRef,
  getChannelPlugin,
  normalizeChannelId,
  type ChannelRouteRef,
  type ConversationRef,
  type SessionBindingRecord,
} from "./_openclaw-stubs.js";
import {
  normalizeConversationTargetParams,
  type ConversationTargetParams,
} from "./conversation-target.js";
import type { DeliveryContext } from "./delivery-context.js";

/**
 * deliveryContextFromChannelRoute 在 cross-wms 的 delivery-context.ts 中未导出。
 * 降级实现：从 route 直接映射为 DeliveryContext。
 */
function deliveryContextFromChannelRoute(route?: ChannelRouteRef): DeliveryContext | undefined {
  if (!route) {
    return undefined;
  }
  const ctx: DeliveryContext = {};
  if (route.channel) {
    ctx.channel = route.channel;
  }
  if (route.to) {
    ctx.to = route.to;
  }
  if (route.accountId) {
    ctx.accountId = route.accountId;
  }
  if (route.threadId != null) {
    ctx.threadId = route.threadId;
  }
  return ctx;
}

/** Formats a conversation id into a deliverable target, using channel hooks before generic fallback. */
export function formatConversationTarget(params: ConversationTargetParams): string | undefined {
  const { channel, conversationId, parentConversationId } =
    normalizeConversationTargetParams(params);
  if (!channel || !conversationId) {
    return undefined;
  }
  const normalizedChannel = normalizeChannelId(channel);
  const pluginTarget = normalizedChannel
    ? getChannelPlugin(normalizedChannel)?.messaging?.resolveDeliveryTarget?.({
        conversationId,
        parentConversationId,
      })
    : null;
  if (pluginTarget?.to?.trim()) {
    return pluginTarget.to.trim();
  }
  return `channel:${conversationId}`;
}

/** Resolves a channel conversation into target/thread fields for delivery routing. */
export function resolveConversationDeliveryTarget(params: ConversationTargetParams): {
  to?: string;
  threadId?: string;
} {
  const { channel, conversationId, parentConversationId } =
    normalizeConversationTargetParams(params);
  const pluginTarget =
    channel && conversationId
      ? getChannelPlugin(normalizeChannelId(channel) ?? channel)?.messaging?.resolveDeliveryTarget?.(
          {
            conversationId,
            parentConversationId,
          },
        )
      : null;
  if (pluginTarget) {
    return {
      ...(pluginTarget.to?.trim() ? { to: pluginTarget.to.trim() } : {}),
      ...(pluginTarget.threadId?.trim() ? { threadId: pluginTarget.threadId.trim() } : {}),
    };
  }
  const to = formatConversationTarget(params);
  return { to };
}

/** Converts a persisted conversation reference into a channel route. */
export function routeFromConversationRef(
  conversation?: ConversationRef | null,
): ChannelRouteRef | undefined {
  if (!conversation) {
    return undefined;
  }
  const target = resolveConversationDeliveryTarget({
    channel: conversation.channel,
    conversationId: conversation.conversationId,
    parentConversationId: conversation.parentConversationId,
  });
  return normalizeChannelRouteRef({
    channel: conversation.channel,
    accountId: conversation.accountId,
    to: target.to,
    threadId: target.threadId,
    threadSource: target.threadId ? "target" : undefined,
  });
}

/** Extracts a channel route from a session binding record. */
export function routeFromBindingRecord(
  binding?: SessionBindingRecord | null,
): ChannelRouteRef | undefined {
  return routeFromConversationRef(binding?.conversation);
}

/** Projects route fields used by older session and delivery callers. */
export function routeToDeliveryFields(route?: ChannelRouteRef): {
  deliveryContext?: DeliveryContext;
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
} {
  const deliveryContext = deliveryContextFromChannelRoute(route);
  return {
    ...(deliveryContext ? { deliveryContext } : {}),
    ...(deliveryContext?.channel ? { channel: deliveryContext.channel } : {}),
    ...(deliveryContext?.to ? { to: deliveryContext.to } : {}),
    ...(deliveryContext?.accountId ? { accountId: deliveryContext.accountId } : {}),
    ...(deliveryContext?.threadId != null ? { threadId: deliveryContext.threadId } : {}),
  };
}
