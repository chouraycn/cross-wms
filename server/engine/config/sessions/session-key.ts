import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { SessionKey } from './types.js';

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

export function generateSessionKey(sessionId?: string): SessionKey {
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

export function validateSessionKey(key: SessionKey): boolean {
  if (!key?.sessionId || !key?.timestamp || !key?.hash) {
    return false;
  }

  const expectedHash = createSessionHash(key.sessionId, key.timestamp);
  return key.hash === expectedHash;
}

export function formatSessionKey(key: SessionKey): string {
  return `${SESSION_KEY_PREFIX}_${SESSION_KEY_VERSION}_${key.sessionId}_${key.timestamp}_${key.hash}`;
}

export function parseSessionKey(formatted: string): SessionKey | null {
  const parts = formatted.split('_');
  if (parts.length !== 5) return null;
  if (parts[0] !== SESSION_KEY_PREFIX) return null;
  if (parts[1] !== SESSION_KEY_VERSION) return null;

  const [, , sessionId, timestampStr, hash] = parts;
  const timestamp = parseInt(timestampStr, 10);

  if (isNaN(timestamp)) return null;

  const key: SessionKey = { sessionId, timestamp, hash };
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

export function getSessionKeyAge(key: SessionKey): number {
  return Date.now() - key.timestamp;
}

export function isSessionKeyExpired(key: SessionKey, maxAgeMs: number): boolean {
  return getSessionKeyAge(key) > maxAgeMs;
}
