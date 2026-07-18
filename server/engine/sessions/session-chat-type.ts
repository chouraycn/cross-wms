/**
 * 会话聊天类型
 *
 * 从会话元数据中分类聊天表面类型
 */

import type { SessionChatType } from './types.js';
import { deriveChatTypeFromKey, parseAgentSessionKey } from './session-key.js';

export type { SessionChatType } from './types.js';

export { deriveChatTypeFromKey } from './session-key.js';

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function resolveScopedSessionKey(sessionKey: string | undefined | null): string {
  const raw = normalizeLowercaseStringOrEmpty(sessionKey);
  if (!raw) return '';
  return parseAgentSessionKey(raw)?.rest ?? raw;
}

function collectLegacyChatTypeCandidatePluginIds(scopedSessionKey: string): string[] {
  const ids = new Set<string>();
  const firstToken = scopedSessionKey.split(':').find(Boolean);
  if (firstToken) {
    ids.add(firstToken);
  }
  if (scopedSessionKey.includes('@g.us')) {
    ids.add('whatsapp');
  }
  return Array.from(ids);
}

export function deriveSessionChatType(sessionKey: string | undefined | null): SessionChatType {
  const builtInType = deriveChatTypeFromKey(sessionKey ?? undefined);
  if (builtInType && builtInType !== 'unknown') {
    return builtInType;
  }

  const scopedSessionKey = resolveScopedSessionKey(sessionKey);
  const candidateIds = collectLegacyChatTypeCandidatePluginIds(scopedSessionKey);

  for (const pluginId of candidateIds) {
    if (pluginId === 'slack' || pluginId === 'discord') {
      if (scopedSessionKey.includes(':channel:') || scopedSessionKey.includes(':group:')) {
        return 'group';
      }
      if (scopedSessionKey.includes(':dm:') || scopedSessionKey.includes(':direct:')) {
        return 'direct';
      }
    }
    if (pluginId === 'whatsapp') {
      if (scopedSessionKey.includes('@g.us')) {
        return 'group';
      }
      return 'direct';
    }
  }

  return 'unknown';
}

export function normalizeChatType(raw?: string | null): SessionChatType {
  const value = normalizeLowercaseStringOrEmpty(raw);
  if (value === 'direct' || value === 'dm') return 'direct';
  if (value === 'group') return 'group';
  if (value === 'channel') return 'channel';
  return 'unknown';
}

export function isGroupChatType(chatType: SessionChatType | undefined | null): boolean {
  return chatType === 'group' || chatType === 'channel';
}

export function isDirectChatType(chatType: SessionChatType | undefined | null): boolean {
  return chatType === 'direct';
}
