/**
 * 会话密钥管理
 *
 * 提供会话密钥的解析、规范化和分类功能
 */

import type { SessionChatType } from './types.js';

export interface ParsedAgentSessionKey {
  agentId: string;
  rest: string;
}

export interface ParsedThreadSessionSuffix {
  baseSessionKey: string | undefined;
  threadId: string | undefined;
}

export interface RawSessionConversationRef {
  channel: string;
  kind: 'group' | 'channel';
  rawId: string;
  prefix: string;
}

function normalizeOptionalString(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeLowercaseString(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  return normalizeLowercaseString(value);
}

function normalizeOptionalLowercaseString(
  value: string | undefined | null,
): string | undefined {
  const trimmed = normalizeOptionalString(value);
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export function normalizeSessionKey(sessionKey: string | undefined | null): string {
  const raw = normalizeOptionalString(sessionKey);
  return raw ? raw.toLowerCase() : '';
}

export function parseAgentSessionKey(
  sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
  const raw = normalizeSessionKey(sessionKey);
  if (!raw) return null;

  const parts = raw.split(':').filter(Boolean);
  if (parts.length < 3) return null;
  if (parts[0] !== 'agent') return null;

  const agentId = normalizeOptionalString(parts[1]);
  const rest = parts.slice(2).join(':');
  if (!agentId || !rest) return null;

  return { agentId, rest };
}

export function isCronSessionKey(sessionKey: string | undefined | null): boolean {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) return false;
  return normalizeLowercaseString(parsed.rest).startsWith('cron:');
}

export function isCronRunSessionKey(sessionKey: string | undefined | null): boolean {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) return false;
  return /^cron:[^:]+:run:[^:]+(?::|$)/.test(parsed.rest);
}

export function isSubagentSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = normalizeOptionalString(sessionKey);
  if (!raw) return false;
  if (normalizeLowercaseString(raw).startsWith('subagent:')) return true;
  const parsed = parseAgentSessionKey(raw);
  return normalizeLowercaseString(parsed?.rest).startsWith('subagent:') === true;
}

export function getSubagentDepth(sessionKey: string | undefined | null): number {
  const raw = normalizeLowercaseString(sessionKey);
  if (!raw) return 0;
  const matches = raw.match(/(^|:)subagent:/g);
  return matches ? matches.length : 0;
}

export function isAcpSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = normalizeOptionalString(sessionKey);
  if (!raw) return false;
  const normalized = normalizeLowercaseString(raw);
  if (normalized.startsWith('acp:')) return true;
  const parsed = parseAgentSessionKey(raw);
  return normalizeLowercaseString(parsed?.rest).startsWith('acp:') === true;
}

export function parseThreadSessionSuffix(
  sessionKey: string | undefined | null,
): ParsedThreadSessionSuffix {
  const raw = normalizeOptionalString(sessionKey);
  if (!raw) {
    return { baseSessionKey: undefined, threadId: undefined };
  }

  const lowerRaw = normalizeLowercaseString(raw);
  const threadMarker = ':thread:';
  const threadIndex = lowerRaw.lastIndexOf(threadMarker);

  const baseSessionKey = threadIndex === -1 ? raw : raw.slice(0, threadIndex);
  const threadIdRaw = threadIndex === -1 ? undefined : raw.slice(threadIndex + threadMarker.length);
  const threadId = normalizeOptionalString(threadIdRaw);

  return { baseSessionKey, threadId };
}

export function parseRawSessionConversationRef(
  sessionKey: string | undefined | null,
): RawSessionConversationRef | null {
  const raw = normalizeOptionalString(sessionKey);
  if (!raw) return null;

  const rawParts = raw.split(':').filter(Boolean);
  const bodyStartIndex =
    rawParts.length >= 3 && normalizeLowercaseString(rawParts[0]) === 'agent' ? 2 : 0;
  const parts = rawParts.slice(bodyStartIndex);
  if (parts.length < 3) return null;

  const channel = normalizeLowercaseString(parts[0]);
  const kind = normalizeLowercaseString(parts[1]);
  if (!channel || (kind !== 'group' && kind !== 'channel')) return null;

  const rawId = normalizeLowercaseStringOrEmpty(parts.slice(2).join(':'));
  const prefix = normalizeLowercaseStringOrEmpty(rawParts.slice(0, bodyStartIndex + 2).join(':'));
  if (!rawId || !prefix) return null;

  return { channel, kind, rawId, prefix };
}

export function deriveChatTypeFromKey(key?: string): SessionChatType | undefined {
  const normalizedKey = normalizeLowercaseString(key);
  if (!normalizedKey) return undefined;

  const tokens = new Set(normalizedKey.split(':').filter(Boolean));
  if (tokens.has('group')) return 'group';
  if (tokens.has('channel')) return 'channel';
  if (tokens.has('direct') || tokens.has('dm')) return 'direct';

  return undefined;
}
