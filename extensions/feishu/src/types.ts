// Feishu plugin module implements types for cross-wms.
import type { FeishuDomain } from "./types.js";

export type FeishuConfig = {
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  domain?: FeishuDomain;
  mediaMaxMb?: number;
  httpTimeoutMs?: number;
  resolveSenderNames?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist" | "disabled";
  groupPolicy?: "open" | "allowlist" | "disabled" | "allowall";
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  groupSenderAllowFrom?: Array<string | number>;
  requireMention?: boolean;
  historyLimit?: number;
  tools?: FeishuToolsConfig;
  replyInThread?: "enabled" | "disabled";
  groups?: Record<string, Partial<FeishuConfig>>;
  accounts?: Record<string, Partial<FeishuConfig>>;
  defaultAccount?: string;
  groupSessionScope?: FeishuGroupSessionScope;
  topicSessionMode?: "enabled" | "disabled";
  groupSenderActivationIngressAccess?: unknown;
};

export type FeishuAccountConfig = FeishuConfig;

export type FeishuGroupSessionScope = "group" | "group_sender" | "group_topic" | "group_topic_sender";

export type FeishuDomain = "feishu" | "lark" | (string & {});

export type FeishuDefaultAccountSelectionSource =
  | "explicit-default"
  | "mapped-default"
  | "fallback";
type FeishuAccountSelectionSource = "explicit" | FeishuDefaultAccountSelectionSource;

export type ResolvedFeishuAccount = {
  accountId: string;
  selectionSource: FeishuAccountSelectionSource;
  enabled: boolean;
  configured: boolean;
  name?: string;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  domain: FeishuDomain;
  config: FeishuConfig;
};

export type FeishuIdType = "open_id" | "user_id" | "union_id" | "chat_id";

export type MentionTarget = {
  openId: string;
  name: string;
};

export type FeishuMessageContext = {
  chatId: string;
  messageId: string;
  replyTargetMessageId?: string;
  typingTargetMessageId?: string;
  suppressReplyTarget?: boolean;
  senderId: string;
  senderOpenId: string;
  senderName?: string;
  chatType: FeishuChatType;
  mentionedBot: boolean;
  hasAnyMention?: boolean;
  rootId?: string;
  parentId?: string;
  threadId?: string;
  content: string;
  contentType: string;
  mentionTargets?: MentionTarget[];
};

export type FeishuSendResult = {
  messageId: string;
  chatId: string;
  receipt: {
    kind: "post" | "interactive" | "media" | "image" | "file" | "audio";
    messageId: string;
  };
};

export type FeishuChatType = "p2p" | "group" | "topic_group" | "private";

export function isFeishuGroupChatType(chatType: FeishuChatType | undefined): boolean {
  return chatType === "group" || chatType === "topic_group";
}

export type FeishuMessageInfo = {
  messageId: string;
  chatId: string;
  chatType?: FeishuChatType;
  senderId?: string;
  senderOpenId?: string;
  senderType?: string;
  content: string;
  contentType: string;
  createTime?: number;
  threadId?: string;
};

export interface FeishuProbeResult {
  ok: boolean;
  appId?: string;
  botName?: string;
  botOpenId?: string;
  error?: string;
}

export type FeishuMediaInfo = {
  path: string;
  contentType?: string;
  placeholder: string;
};

export type FeishuToolsConfig = {
  doc?: boolean;
  chat?: boolean;
  wiki?: boolean;
  drive?: boolean;
  perm?: boolean;
  scopes?: boolean;
  bitable?: boolean;
  base?: boolean;
};

export type DynamicAgentCreationConfig = {
  enabled?: boolean;
  workspaceTemplate?: string;
  agentDirTemplate?: string;
  maxAgents?: number;
};

export type FeishuPermissionError = {
  grantUrl?: string;
  scopeName?: string;
  errorMessage?: string;
};
