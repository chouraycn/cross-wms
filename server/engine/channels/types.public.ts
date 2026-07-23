// 移植自 openclaw/src/channels/plugins/types.public.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

import type { TSchema } from "typebox";

export const CHANNEL_MESSAGE_ACTION_NAMES: readonly string[] = [];

export type ChannelMessageCapability = string;

export type ChannelPlugin = {
  id: string;
  actions?: ChannelMessageActionAdapter;
  threading?: ChannelThreadingAdapter;
  messaging?: ChannelMessagingAdapter;
  commands?: { nativeCommandsAutoEnabled?: boolean };
  [key: string]: unknown;
};

export type ChannelId = string;

export type ChannelMessageActionName = string;

export type ChannelThreadingToolContext = {
  currentChannelId?: string;
  currentMessagingTarget?: string;
  currentGraphChannelId?: string;
  currentChannelProvider?: ChannelId;
  currentThreadTs?: string;
  currentMessageId?: string | number;
  replyToMode?: "off" | "first" | "all" | "batched";
  hasRepliedRef?: { value: boolean };
  sameChannelThreadRequired?: boolean;
  skipCrossContextDecoration?: boolean;
};

export type ChannelMessageActionDiscoveryContext = {
  cfg: unknown;
  currentChannelId?: string | null;
  currentChannelProvider?: string | null;
  currentThreadTs?: string | null;
  currentMessageId?: string | number | null;
  accountId?: string | null;
  sessionKey?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  requesterSenderId?: string | null;
  senderIsOwner?: boolean;
};

export type ChannelMessageToolSchemaContribution = {
  properties: Record<string, TSchema>;
  actions?: readonly ChannelMessageActionName[] | null;
  visibility?: "current-channel" | "all-configured";
};

export type ChannelMessageToolDiscovery = {
  actions?: readonly ChannelMessageActionName[] | null;
  capabilities?: readonly ChannelMessageCapability[] | null;
  schema?: ChannelMessageToolSchemaContribution | ChannelMessageToolSchemaContribution[] | null;
  mediaSourceParams?:
    | readonly string[]
    | Partial<Record<ChannelMessageActionName, readonly string[]>>
    | null;
};

export type ChannelMessageActionAdapter = {
  describeMessageTool: (
    params: ChannelMessageActionDiscoveryContext,
  ) => ChannelMessageToolDiscovery | null | undefined;
  supportsAction?: (params: { action: ChannelMessageActionName }) => boolean;
  [key: string]: unknown;
};

export type ChannelThreadingAdapter = {
  matchesToolContextTarget?: (params: {
    target: string;
    toolContext: ChannelThreadingToolContext;
  }) => boolean;
  [key: string]: unknown;
};

export type ChannelMessagingAdapter = {
  buildCrossContextPresentation?: (params: {
    originLabel: string;
    message: string;
    cfg: unknown;
    accountId?: string | null;
  }) => unknown;
  [key: string]: unknown;
};
