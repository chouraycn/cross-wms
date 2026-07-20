// 移植自 openclaw/src/channels/plugins/target-parsing-loaded.ts

import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
  normalizeOptionalThreadValue,
} from "../infra/string-coerce.js";

export type ChannelRouteParsedTarget = {
  channel: string;
  rawTo: string;
  to: string;
  threadId?: string | number;
  chatType?: "direct" | "group" | "channel";
};

/** @deprecated Use `ChannelRouteParsedTarget` */
export type ParsedChannelExplicitTarget = {
  to: string;
  threadId?: string | number;
  chatType?: "direct" | "group" | "channel";
};

export function resolveCompatParsedRouteTarget(params: {
  channel: string;
  rawTarget?: string | null;
  fallbackThreadId?: string | number | null;
  parseTarget: (channel: string, rawTarget: string) => ParsedChannelExplicitTarget | null;
}): ChannelRouteParsedTarget | null {
  const channel = normalizeLowercaseStringOrEmpty(params.channel);
  const rawTo = normalizeOptionalString(params.rawTarget);
  if (!channel || !rawTo) {
    return null;
  }
  const parsed = params.parseTarget(channel, rawTo);
  const fallbackThreadId = normalizeOptionalThreadValue(params.fallbackThreadId);
  return {
    channel,
    rawTo,
    to: parsed?.to ?? rawTo,
    threadId: normalizeOptionalThreadValue(parsed?.threadId ?? fallbackThreadId),
    chatType: parsed?.chatType,
  };
}

/** @deprecated Use `ChannelRouteParsedTarget`. */
export type ComparableChannelTarget = ChannelRouteParsedTarget;

/** @deprecated Use `messaging.targetResolver` and `messaging.resolveOutboundSessionRoute`. */
export function parseExplicitTargetForLoadedChannel(
  _channel: string,
  _rawTarget: string,
): ParsedChannelExplicitTarget | null {
  // Without loaded channel plugin registry, we cannot parse targets.
  // Callers should migrate to messaging.targetResolver.
  return null;
}

/** @deprecated Use `messaging.resolveOutboundSessionRoute`. */
export function resolveRouteTargetForLoadedChannel(params: {
  channel: string;
  rawTarget?: string | null;
  fallbackThreadId?: string | number | null;
}): ChannelRouteParsedTarget | null {
  return resolveCompatParsedRouteTarget({
    ...params,
    parseTarget: parseExplicitTargetForLoadedChannel,
  });
}

export function resolveExplicitDeliveryTargetCompat(params: {
  channel: string;
  rawTarget?: string | null;
  fallbackThreadId?: string | number | null;
}): ChannelRouteParsedTarget | null {
  return resolveRouteTargetForLoadedChannel(params);
}

/** @deprecated Use `messaging.resolveOutboundSessionRoute`. */
export function resolveComparableTargetForLoadedChannel(params: {
  channel: string;
  rawTarget?: string | null;
  fallbackThreadId?: string | number | null;
}): ChannelRouteParsedTarget | null {
  return resolveRouteTargetForLoadedChannel(params);
}

/** @deprecated Use `channelRouteTargetsMatchExact`. */
export function comparableChannelTargetsMatch(params: {
  left?: ChannelRouteParsedTarget | null;
  right?: ChannelRouteParsedTarget | null;
}): boolean {
  if (!params.left || !params.right) return false;
  return (
    params.left.channel === params.right.channel &&
    params.left.to === params.right.to &&
    params.left.threadId === params.right.threadId
  );
}

/** @deprecated Use `channelRouteTargetsShareConversation`. */
export function comparableChannelTargetsShareRoute(params: {
  left?: ChannelRouteParsedTarget | null;
  right?: ChannelRouteParsedTarget | null;
}): boolean {
  if (!params.left || !params.right) return false;
  return params.left.channel === params.right.channel && params.left.to === params.right.to;
}
