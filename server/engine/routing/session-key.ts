import { logger } from '../../logger.js';
import { DEFAULT_ACCOUNT_ID, normalizeAccountId, normalizeOptionalAccountId } from './account-id.js';
import type { ChatType } from './types.js';

export { DEFAULT_ACCOUNT_ID, normalizeAccountId, normalizeOptionalAccountId } from './account-id.js';

export const DEFAULT_AGENT_ID = 'main';
export const DEFAULT_MAIN_KEY = 'main';

export type SessionKeyShape = 'missing' | 'agent' | 'legacy_or_alias' | 'malformed_agent';

const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

export function normalizeMainKey(value: string | undefined | null): string {
  return normalizeLowercaseStringOrEmpty(value) || DEFAULT_MAIN_KEY;
}

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  const normalized = normalizeLowercaseStringOrEmpty(trimmed);
  if (VALID_ID_RE.test(trimmed)) {
    return normalized;
  }
  return (
    normalized
      .replace(INVALID_CHARS_RE, '-')
      .replace(LEADING_DASH_RE, '')
      .replace(TRAILING_DASH_RE, '')
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function normalizeOptionalAgentId(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? normalizeAgentId(trimmed) : undefined;
}

export function isValidAgentId(value: string | undefined | null): boolean {
  const trimmed = (value ?? '').trim();
  return Boolean(trimmed) && VALID_ID_RE.test(trimmed);
}

export function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.mainKey);
  return `agent:${agentId}:${mainKey}`;
}

export function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
  channel: string;
  accountId?: string | null;
  peerKind?: ChatType | null;
  peerId?: string | null;
  dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer';
}): string {
  const peerKind = params.peerKind ?? 'direct';
  if (peerKind === 'direct') {
    const dmScope = params.dmScope ?? 'main';
    let peerId = (params.peerId ?? '').trim();
    peerId = normalizeLowercaseStringOrEmpty(peerId);
    if (dmScope === 'per-account-channel-peer' && peerId) {
      const channel = normalizeLowercaseStringOrEmpty(params.channel) || 'unknown';
      const accountId = normalizeAccountId(params.accountId);
      return `agent:${normalizeAgentId(params.agentId)}:${channel}:${accountId}:direct:${peerId}`;
    }
    if (dmScope === 'per-channel-peer' && peerId) {
      const channel = normalizeLowercaseStringOrEmpty(params.channel) || 'unknown';
      return `agent:${normalizeAgentId(params.agentId)}:${channel}:direct:${peerId}`;
    }
    if (dmScope === 'per-peer' && peerId) {
      return `agent:${normalizeAgentId(params.agentId)}:direct:${peerId}`;
    }
    return buildAgentMainSessionKey({
      agentId: params.agentId,
      mainKey: params.mainKey,
    });
  }
  const channel = normalizeLowercaseStringOrEmpty(params.channel) || 'unknown';
  const peerId = normalizeLowercaseStringOrEmpty(params.peerId) || 'unknown';
  return `agent:${normalizeAgentId(params.agentId)}:${channel}:${peerKind}:${peerId}`;
}

export function parseAgentSessionKey(sessionKey: string): { agentId: string; rest: string } | null {
  const trimmed = sessionKey.trim();
  if (!trimmed.startsWith('agent:')) {
    return null;
  }
  const afterPrefix = trimmed.slice('agent:'.length);
  const colonIdx = afterPrefix.indexOf(':');
  if (colonIdx === -1) {
    return null;
  }
  const agentId = afterPrefix.slice(0, colonIdx);
  const rest = afterPrefix.slice(colonIdx + 1);
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
}

export function resolveAgentIdFromSessionKey(sessionKey: string | undefined | null): string {
  const parsed = parseAgentSessionKey(sessionKey ?? '');
  return normalizeAgentId(parsed?.agentId ?? DEFAULT_AGENT_ID);
}

export function classifySessionKeyShape(sessionKey: string | undefined | null): SessionKeyShape {
  const raw = (sessionKey ?? '').trim();
  if (!raw) {
    return 'missing';
  }
  if (parseAgentSessionKey(raw)) {
    return 'agent';
  }
  return normalizeLowercaseStringOrEmpty(raw).startsWith('agent:')
    ? 'malformed_agent'
    : 'legacy_or_alias';
}

export function buildGroupHistoryKey(params: {
  channel: string;
  accountId?: string | null;
  peerKind: 'group' | 'channel';
  peerId: string;
}): string {
  const channel = normalizeLowercaseStringOrEmpty(params.channel) || 'unknown';
  const accountId = normalizeAccountId(params.accountId);
  const peerId = normalizeLowercaseStringOrEmpty(params.peerId) || 'unknown';
  return `${channel}:${accountId}:${params.peerKind}:${peerId}`;
}

export function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
  useSuffix?: boolean;
}): { sessionKey: string; parentSessionKey?: string } {
  const threadId = (params.threadId ?? '').trim();
  if (!threadId) {
    return { sessionKey: params.baseSessionKey, parentSessionKey: undefined };
  }
  const normalizedThread = normalizeLowercaseStringOrEmpty(threadId);
  const useSuffix = params.useSuffix ?? true;
  const sessionKey = useSuffix
    ? `${params.baseSessionKey}:thread:${normalizedThread}`
    : params.baseSessionKey;
  logger.debug(`[Routing:SessionKey] Thread session key: ${sessionKey}`);
  return { sessionKey, parentSessionKey: params.parentSessionKey };
}
