// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { SessionEntry } from './types.js';
import type { SessionScope } from './types.js';
import type { MsgContext } from '../../auto-reply/templating.js';
import {
  buildAgentMainSessionKey,
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  normalizeMainKey,
} from '../../routing/session-key.js';
import { normalizeE164 } from '../../utils.js';
import { normalizeExplicitSessionKey } from './explicit-session-key-normalization.js';
import { resolveGroupSessionKey } from './group.js';

const SESSION_KEY_PREFIX = 'sess';
const SESSION_KEY_VERSION = 'v1';

/**
 * 会话密钥解析后的组成部分。
 * 与 formatSessionKey 生成的字符串一一对应：
 *   `{prefix}_{version}_{sessionId}_{timestamp}_{hash}`
 */
export interface SessionKeyParts {
  /** 密钥前缀，固定为 "sess" */
  prefix: string;
  /** 密钥版本，固定为 "v1" */
  version: string;
  /** 会话 ID */
  sessionId: string;
  /** 生成时间戳（毫秒） */
  timestamp: number;
  /** 校验哈希 */
  hash: string;
}

export function generateSessionId(): string {
  return randomUUID().replace(/-/g, '');
}

export function generateSessionKey(sessionId?: string): SessionEntry {
  const id = sessionId || generateSessionId();
  const timestamp = Date.now();
  const hash = createSessionHash(id, timestamp);

  return {
    sessionId: id,
    timestamp,
    hash,
  };
}

export function createSessionHash(sessionId: string, timestamp: number): string {
  const data = `${SESSION_KEY_PREFIX}:${SESSION_KEY_VERSION}:${sessionId}:${timestamp}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export function validateSessionKey(key: SessionEntry): boolean {
  if (!key?.sessionId || !key?.timestamp || !key?.hash) {
    return false;
  }

  const expectedHash = createSessionHash(key.sessionId, key.timestamp);
  return key.hash === expectedHash;
}

export function formatSessionKey(key: SessionEntry): string {
  return `${SESSION_KEY_PREFIX}_${SESSION_KEY_VERSION}_${key.sessionId}_${key.timestamp}_${key.hash}`;
}

export function parseSessionKey(formatted: string): SessionEntry | null {
  const parts = formatted.split('_');
  if (parts.length !== 5) return null;
  if (parts[0] !== SESSION_KEY_PREFIX) return null;
  if (parts[1] !== SESSION_KEY_VERSION) return null;

  const [, , sessionId, timestampStr, hash] = parts;
  const timestamp = parseInt(timestampStr, 10);

  if (isNaN(timestamp)) return null;

  const key: SessionEntry = { sessionId, timestamp, hash };
  if (!validateSessionKey(key)) return null;

  return key;
}

export function deriveChildSessionId(parentId: string, index: number): string {
  const data = `${parentId}:child:${index}`;
  const hash = createHash('sha256').update(data).digest('hex');
  return `${parentId.slice(0, 8)}-${hash.slice(0, 8)}`;
}

export function isSessionIdValid(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length < 8 || id.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function normalizeSessionId(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export function getShortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

export function getSessionKeyAge(key: SessionEntry): number {
  return Date.now() - key.timestamp;
}

export function isSessionKeyExpired(key: SessionEntry, maxAgeMs: number): boolean {
  return getSessionKeyAge(key) > maxAgeMs;
}

// ============================================================================
// OpenClaw session key resolution (merged from openclaw/src/config/sessions/session-key.ts)
// Maps inbound message context to persisted store buckets.
// ============================================================================

/**
 * Derives the raw session bucket from message context before agent/main-key normalization.
 *
 * Direct chats use sender identity, groups use channel-owned group keys, and global scope bypasses
 * sender routing entirely.
 */
export function deriveSessionKey(scope: SessionScope, ctx: MsgContext) {
  if (scope === "global") {
    return "global";
  }
  const resolvedGroup = resolveGroupSessionKey(ctx);
  if (resolvedGroup) {
    return resolvedGroup.key;
  }
  const from = ctx.From ? normalizeE164(ctx.From) : "";
  return from || "unknown";
}

/**
 * Resolves the persisted session-store key for an inbound message.
 *
 * Explicit session keys pass through the compatibility normalizer, direct chats collapse to the
 * agent's canonical main bucket, and group/channel sessions stay isolated under the same agent.
 */
export function resolveSessionKey(
  scope: SessionScope,
  ctx: MsgContext,
  mainKey?: string,
  agentId: string = DEFAULT_AGENT_ID,
) {
  const explicit = ctx.SessionKey?.trim();
  if (explicit) {
    return normalizeExplicitSessionKey(explicit, ctx);
  }
  const raw = deriveSessionKey(scope, ctx);
  if (scope === "global") {
    return raw;
  }
  const canonicalAgentId = normalizeAgentId(agentId);
  const canonicalMainKey = normalizeMainKey(mainKey);
  const canonical = buildAgentMainSessionKey({
    agentId: canonicalAgentId,
    mainKey: canonicalMainKey,
  });
  const isGroup = raw.includes(":group:") || raw.includes(":channel:");
  if (!isGroup) {
    return canonical;
  }
  // Keep channel/group sessions separate from direct main sessions while still namespacing them
  // by agent id so multi-agent stores do not collide on provider-owned group keys.
  return `agent:${canonicalAgentId}:${raw}`;
}
