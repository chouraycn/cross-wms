/**
 * 发送策略
 *
 * 决定会话输出何时可以发送到目标
 */

import type { SessionSendPolicyDecision, SessionChatType, SessionRecord } from './types.js';
import { deriveChatTypeFromKey } from './session-key.js';

export type { SessionSendPolicyDecision } from './types.js';

function normalizeOptionalLowercaseString(
  value: string | undefined | null,
): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeSendPolicy(
  raw?: string | null,
): SessionSendPolicyDecision | undefined {
  const value = normalizeOptionalLowercaseString(raw);
  if (value === 'allow') {
    return 'allow';
  }
  if (value === 'deny') {
    return 'deny';
  }
  return undefined;
}

function normalizeChatType(raw?: string | null): SessionChatType | undefined {
  const value = normalizeOptionalLowercaseString(raw);
  if (value === 'direct' || value === 'dm') return 'direct';
  if (value === 'group') return 'group';
  if (value === 'channel') return 'channel';
  return undefined;
}

function stripAgentSessionKeyPrefix(key?: string): string | undefined {
  if (!key) return undefined;
  const parts = key.split(':').filter(Boolean);
  if (parts.length >= 3 && parts[0].toLowerCase() === 'agent') {
    return parts.slice(2).join(':');
  }
  return key;
}

const CHANNEL_SESSION_KEY_PEER_KINDS = new Set(['group', 'channel', 'direct', 'dm']);

function deriveChannelFromKey(key?: string): string | undefined {
  const normalizedKey = stripAgentSessionKeyPrefix(key);
  if (!normalizedKey) return undefined;

  const parts = normalizedKey.split(':').filter(Boolean);
  const hasChannelPeerShape =
    parts.length >= 3 && CHANNEL_SESSION_KEY_PEER_KINDS.has(parts[1]?.toLowerCase() ?? '');
  const hasAccountScopedPeerShape =
    parts.length >= 4 && CHANNEL_SESSION_KEY_PEER_KINDS.has(parts[2]?.toLowerCase() ?? '');

  if (hasChannelPeerShape || hasAccountScopedPeerShape) {
    return normalizeOptionalLowercaseString(parts[0]);
  }
  return undefined;
}

export interface SendPolicyRuleMatch {
  channel?: string;
  chatType?: string;
  keyPrefix?: string;
  rawKeyPrefix?: string;
}

export interface SendPolicyRule {
  action: string;
  match?: SendPolicyRuleMatch;
}

export interface SendPolicyConfig {
  default?: string;
  rules?: SendPolicyRule[];
}

export interface ResolveSendPolicyParams {
  policy?: SendPolicyConfig;
  entry?: SessionRecord;
  sessionKey?: string;
  channel?: string;
  chatType?: SessionChatType;
}

export function resolveSendPolicy(params: ResolveSendPolicyParams): SessionSendPolicyDecision {
  const override = normalizeSendPolicy(params.entry?.metadata.sendPolicy);
  if (override) {
    return override;
  }

  const policy = params.policy;
  if (!policy) {
    return 'allow';
  }

  const rawSessionKey = params.sessionKey ?? '';
  const strippedSessionKey = stripAgentSessionKeyPrefix(rawSessionKey) ?? '';
  const rawSessionKeyNorm = normalizeLowercaseStringOrEmpty(rawSessionKey);
  const strippedSessionKeyNorm = normalizeLowercaseStringOrEmpty(strippedSessionKey);

  let channel: string | undefined;
  let chatType: SessionChatType | undefined;

  const getChannel = (): string | undefined => {
    if (channel === undefined) {
      channel =
        normalizeOptionalLowercaseString(params.channel) ??
        normalizeOptionalLowercaseString(params.entry?.metadata.channel) ??
        deriveChannelFromKey(params.sessionKey);
    }
    return channel;
  };

  const getChatType = (): SessionChatType | undefined => {
    if (chatType === undefined) {
      chatType =
        normalizeChatType(params.chatType ?? params.entry?.metadata.chatType) ??
        normalizeChatType(deriveChatTypeFromKey(params.sessionKey));
    }
    return chatType;
  };

  let allowedMatch = false;

  for (const rule of policy.rules ?? []) {
    if (!rule) continue;

    const action = normalizeSendPolicy(rule.action) ?? 'allow';
    const match = rule.match ?? {};
    const matchChannel = normalizeOptionalLowercaseString(match.channel);
    const matchChatType = normalizeChatType(match.chatType);
    const matchPrefix = normalizeOptionalLowercaseString(match.keyPrefix);
    const matchRawPrefix = normalizeOptionalLowercaseString(match.rawKeyPrefix);

    if (matchChannel && matchChannel !== getChannel()) {
      continue;
    }
    if (matchChatType && matchChatType !== getChatType()) {
      continue;
    }
    if (matchRawPrefix && !rawSessionKeyNorm.startsWith(matchRawPrefix)) {
      continue;
    }
    if (
      matchPrefix &&
      !rawSessionKeyNorm.startsWith(matchPrefix) &&
      !strippedSessionKeyNorm.startsWith(matchPrefix)
    ) {
      continue;
    }

    if (action === 'deny') {
      return 'deny';
    }
    allowedMatch = true;
  }

  if (allowedMatch) {
    return 'allow';
  }

  const fallback = normalizeSendPolicy(policy.default);
  return fallback ?? 'allow';
}
