/**
 * 共享会话聊天类型辅助 — 跨模块复用的 chat type 分类
 *
 * 从会话密钥中尽力提取聊天表面类型，覆盖规范格式与历史遗留格式。
 *
 * 参考 openclaw/src/sessions/session-chat-type-shared.ts
 */

import { normalizeLowercaseStringOrEmpty } from '../infra/string-coerce.js';
import { parseAgentSessionKey } from './session-key.js';

export type SessionKeyChatType = 'direct' | 'group' | 'channel' | 'unknown';

/**
 * 内置历史遗留 chat type 识别
 *
 * - `group:<id>` 形态归为 "group"
 * - WhatsApp 群组的 `<id>@g.us` 形态归为 "group"
 * - Discord 的 `discord:<...>:guild-<id>:channel-<id>` 形态归为 "channel"
 */
function deriveBuiltInLegacySessionChatType(
  scopedSessionKey: string,
): SessionKeyChatType | undefined {
  if (/^group:[^:]+$/.test(scopedSessionKey)) {
    return 'group';
  }
  if (/^(?:whatsapp:)?[^:]+@g\.us$/.test(scopedSessionKey)) {
    return 'group';
  }
  if (/^discord:(?:[^:]+:)?guild-[^:]+:channel-[^:]+$/.test(scopedSessionKey)) {
    return 'channel';
  }
  return undefined;
}

/**
 * 从已剥离 agent 头部的 scoped session key 中识别 chat type
 *
 * 1. token 包含 "group"/"channel"/"direct"/"dm" 时返回对应类型
 * 2. 调用内置遗留匹配
 * 3. 依次调用外部传入的 legacy deriver
 * 4. 全部失败返回 "unknown"
 */
export function deriveSessionChatTypeFromScopedKey(
  scopedSessionKey: string,
  deriveLegacySessionChatTypes: Array<
    (scopedSessionKey: string) => SessionKeyChatType | undefined
  > = [],
): SessionKeyChatType {
  const tokens = new Set(scopedSessionKey.split(':').filter(Boolean));
  if (tokens.has('group')) {
    return 'group';
  }
  if (tokens.has('channel')) {
    return 'channel';
  }
  if (tokens.has('direct') || tokens.has('dm')) {
    return 'direct';
  }
  const builtInLegacy = deriveBuiltInLegacySessionChatType(scopedSessionKey);
  if (builtInLegacy) {
    return builtInLegacy;
  }
  for (const deriveLegacySessionChatType of deriveLegacySessionChatTypes) {
    const derived = deriveLegacySessionChatType(scopedSessionKey);
    if (derived) {
      return derived;
    }
  }
  return 'unknown';
}

/**
 * 尽力从会话密钥中提取聊天表面类型 — 覆盖规范与历史遗留格式
 *
 * 自动剥离 `agent:<id>:` 头部后委托 deriveSessionChatTypeFromScopedKey。
 */
export function deriveSessionChatTypeFromKey(
  sessionKey: string | undefined | null,
  deriveLegacySessionChatTypes: Array<
    (scopedSessionKey: string) => SessionKeyChatType | undefined
  > = [],
): SessionKeyChatType {
  const raw = normalizeLowercaseStringOrEmpty(sessionKey);
  if (!raw) {
    return 'unknown';
  }
  const scoped = parseAgentSessionKey(raw)?.rest ?? raw;
  return deriveSessionChatTypeFromScopedKey(scoped, deriveLegacySessionChatTypes);
}
