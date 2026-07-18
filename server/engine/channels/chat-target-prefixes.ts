/**
 * Chat 目标前缀解析 — 解析 service 限定的 chat id、guid、identifier 与发送者允许列表目标
 *
 * 参考 openclaw/src/channels/plugins/chat-target-prefixes.ts
 */
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../infra/string-coerce.js";
import { normalizeStringEntries } from "../infra/string-normalization.js";
import { parseStrictInteger } from "../infra/parse-finite-number.js";

/** Service 限定的目标字符串前缀映射 */
export type ServicePrefix<TService extends string> = { prefix: string; service: TService };

/** chat 目标前缀解析器输入 */
export type ChatTargetPrefixesParams = {
  trimmed: string;
  lower: string;
  chatIdPrefixes: string[];
  chatGuidPrefixes: string[];
  chatIdentifierPrefixes: string[];
};

/** 频道允许列表与目标解析器接受的会话目标形式 */
export type ParsedChatTarget =
  | { kind: "chat_id"; chatId: number }
  | { kind: "chat_guid"; chatGuid: string }
  | { kind: "chat_identifier"; chatIdentifier: string };

/** 解析后的允许列表目标，包括发送者句柄 */
export type ParsedChatAllowTarget = ParsedChatTarget | { kind: "handle"; handle: string };

/** 用于 chat 感知允许列表检查的发送者元数据 */
export type ChatSenderAllowParams = {
  allowFrom: Array<string | number>;
  sender: string;
  chatId?: number | null;
  chatGuid?: string | null;
  chatIdentifier?: string | null;
  allowConversationTargets?: boolean | null;
};

/** 检查发送者或当前会话是否匹配允许列表条目 */
export function isAllowedParsedChatSender(params: {
  allowFrom: Array<string | number>;
  sender: string;
  chatId?: number | null;
  chatGuid?: string | null;
  chatIdentifier?: string | null;
  allowConversationTargets?: boolean | null;
  normalizeSender: (sender: string) => string;
  parseAllowTarget: (entry: string) => ParsedChatAllowTarget;
}): boolean {
  const allowFrom = normalizeStringEntries(params.allowFrom);
  if (allowFrom.length === 0) {
    return false;
  }
  if (allowFrom.includes("*")) {
    return true;
  }

  const senderNormalized = params.normalizeSender(params.sender);
  const allowConversationTargets = params.allowConversationTargets === true;
  // 仅在频道 opt-in 时考虑会话 id；否则允许列表保持发送者句柄基础以兼容旧配置
  const chatId = allowConversationTargets ? (params.chatId ?? undefined) : undefined;
  const chatGuid = allowConversationTargets
    ? normalizeOptionalString(params.chatGuid)
    : undefined;
  const chatIdentifier = allowConversationTargets
    ? normalizeOptionalString(params.chatIdentifier)
    : undefined;

  for (const entry of allowFrom) {
    if (!entry) {
      continue;
    }
    const parsed = params.parseAllowTarget(entry);
    if (parsed.kind === "chat_id" && chatId !== undefined) {
      if (parsed.chatId === chatId) {
        return true;
      }
    } else if (parsed.kind === "chat_guid" && chatGuid) {
      if (parsed.chatGuid === chatGuid) {
        return true;
      }
    } else if (parsed.kind === "chat_identifier" && chatIdentifier) {
      if (parsed.chatIdentifier === chatIdentifier) {
        return true;
      }
    } else if (parsed.kind === "handle" && senderNormalized) {
      if (parsed.handle === senderNormalized) {
        return true;
      }
    }
  }
  return false;
}

function stripPrefix(value: string, prefix: string): string {
  return value.slice(prefix.length).trim();
}

function startsWithAnyPrefix(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

/** 解析 service 限定的句柄目标，将 chat 形式的剩余部分委托给 chat 解析 */
export function resolveServicePrefixedTarget<TService extends string, TTarget>(params: {
  trimmed: string;
  lower: string;
  servicePrefixes: Array<ServicePrefix<TService>>;
  isChatTarget: (remainderLower: string) => boolean;
  parseTarget: (remainder: string) => TTarget;
}): ({ kind: "handle"; to: string; service: TService } | TTarget) | null {
  for (const { prefix, service } of params.servicePrefixes) {
    if (!params.lower.startsWith(prefix)) {
      continue;
    }
    const remainder = stripPrefix(params.trimmed, prefix);
    if (!remainder) {
      throw new Error(`${prefix} target is required`);
    }
    const remainderLower = normalizeLowercaseStringOrEmpty(remainder);
    if (params.isChatTarget(remainderLower)) {
      return params.parseTarget(remainder);
    }
    return { kind: "handle", to: remainder, service };
  }
  return null;
}

/** 当 chat id 应绕过句柄解析时，解析 service 限定的目标 */
export function resolveServicePrefixedChatTarget<TService extends string, TTarget>(params: {
  trimmed: string;
  lower: string;
  servicePrefixes: Array<ServicePrefix<TService>>;
  chatIdPrefixes: string[];
  chatGuidPrefixes: string[];
  chatIdentifierPrefixes: string[];
  extraChatPrefixes?: string[];
  parseTarget: (remainder: string) => TTarget;
}): ({ kind: "handle"; to: string; service: TService } | TTarget) | null {
  const chatPrefixes = [
    ...params.chatIdPrefixes,
    ...params.chatGuidPrefixes,
    ...params.chatIdentifierPrefixes,
    ...(params.extraChatPrefixes ?? []),
  ];
  return resolveServicePrefixedTarget({
    trimmed: params.trimmed,
    lower: params.lower,
    servicePrefixes: params.servicePrefixes,
    isChatTarget: (remainderLower) => startsWithAnyPrefix(remainderLower, chatPrefixes),
    parseTarget: params.parseTarget,
  });
}

/** 解析 chat 目标前缀，对格式错误的带前缀值抛错 */
export function parseChatTargetPrefixesOrThrow(
  params: ChatTargetPrefixesParams,
): ParsedChatTarget | null {
  for (const prefix of params.chatIdPrefixes) {
    if (params.lower.startsWith(prefix)) {
      const value = stripPrefix(params.trimmed, prefix);
      const chatId = parseStrictInteger(value);
      if (chatId === undefined) {
        throw new Error(`Invalid chat_id: ${value}`);
      }
      return { kind: "chat_id", chatId };
    }
  }

  for (const prefix of params.chatGuidPrefixes) {
    if (params.lower.startsWith(prefix)) {
      const value = stripPrefix(params.trimmed, prefix);
      if (!value) {
        throw new Error("chat_guid is required");
      }
      return { kind: "chat_guid", chatGuid: value };
    }
  }

  for (const prefix of params.chatIdentifierPrefixes) {
    if (params.lower.startsWith(prefix)) {
      const value = stripPrefix(params.trimmed, prefix);
      if (!value) {
        throw new Error("chat_identifier is required");
      }
      return { kind: "chat_identifier", chatIdentifier: value };
    }
  }

  return null;
}

/** 解析 service 限定的允许列表目标 */
export function resolveServicePrefixedAllowTarget<TAllowTarget>(params: {
  trimmed: string;
  lower: string;
  servicePrefixes: Array<{ prefix: string }>;
  parseAllowTarget: (remainder: string) => TAllowTarget;
}): (TAllowTarget | { kind: "handle"; handle: string }) | null {
  for (const { prefix } of params.servicePrefixes) {
    if (!params.lower.startsWith(prefix)) {
      continue;
    }
    const remainder = stripPrefix(params.trimmed, prefix);
    if (!remainder) {
      return { kind: "handle", handle: "" };
    }
    return params.parseAllowTarget(remainder);
  }
  return null;
}

/** 在回退到 chat 前缀之前解析 service 限定的允许目标 */
export function resolveServicePrefixedOrChatAllowTarget<
  TAllowTarget extends ParsedChatAllowTarget,
>(params: {
  trimmed: string;
  lower: string;
  servicePrefixes: Array<{ prefix: string }>;
  parseAllowTarget: (remainder: string) => TAllowTarget;
  chatIdPrefixes: string[];
  chatGuidPrefixes: string[];
  chatIdentifierPrefixes: string[];
}): TAllowTarget | null {
  const servicePrefixed = resolveServicePrefixedAllowTarget({
    trimmed: params.trimmed,
    lower: params.lower,
    servicePrefixes: params.servicePrefixes,
    parseAllowTarget: params.parseAllowTarget,
  });
  if (servicePrefixed) {
    return servicePrefixed as TAllowTarget;
  }

  const chatTarget = parseChatAllowTargetPrefixes({
    trimmed: params.trimmed,
    lower: params.lower,
    chatIdPrefixes: params.chatIdPrefixes,
    chatGuidPrefixes: params.chatGuidPrefixes,
    chatIdentifierPrefixes: params.chatIdentifierPrefixes,
  });
  if (chatTarget) {
    return chatTarget as TAllowTarget;
  }
  return null;
}

/** 为 chat 感知频道允许列表创建可复用的发送者匹配器 */
export function createAllowedChatSenderMatcher(params: {
  normalizeSender: (sender: string) => string;
  parseAllowTarget: (entry: string) => ParsedChatAllowTarget;
  allowConversationTargets?: boolean;
}): (input: ChatSenderAllowParams) => boolean {
  return (input) =>
    isAllowedParsedChatSender({
      allowFrom: input.allowFrom,
      sender: input.sender,
      chatId: input.chatId,
      chatGuid: input.chatGuid,
      chatIdentifier: input.chatIdentifier,
      allowConversationTargets:
        input.allowConversationTargets ?? params.allowConversationTargets ?? false,
      normalizeSender: params.normalizeSender,
      parseAllowTarget: params.parseAllowTarget,
    });
}

/** 为允许列表条目解析 chat 目标前缀，忽略格式错误的值 */
export function parseChatAllowTargetPrefixes(
  params: ChatTargetPrefixesParams,
): ParsedChatTarget | null {
  for (const prefix of params.chatIdPrefixes) {
    if (params.lower.startsWith(prefix)) {
      const value = stripPrefix(params.trimmed, prefix);
      const chatId = parseStrictInteger(value);
      if (chatId !== undefined) {
        return { kind: "chat_id", chatId };
      }
    }
  }

  for (const prefix of params.chatGuidPrefixes) {
    if (params.lower.startsWith(prefix)) {
      const value = stripPrefix(params.trimmed, prefix);
      if (value) {
        return { kind: "chat_guid", chatGuid: value };
      }
    }
  }

  for (const prefix of params.chatIdentifierPrefixes) {
    if (params.lower.startsWith(prefix)) {
      const value = stripPrefix(params.trimmed, prefix);
      if (value) {
        return { kind: "chat_identifier", chatIdentifier: value };
      }
    }
  }

  return null;
}
