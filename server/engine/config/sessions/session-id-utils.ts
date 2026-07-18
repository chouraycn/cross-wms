import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

const SESSION_ID_PREFIX = 'sess';
const SESSION_ID_VERSION = 'v1';
const SESSION_ID_LENGTH = 32;

export function generateSessionId(): string {
  return randomUUID().replace(/-/g, '');
}

export function generatePrefixedSessionId(): string {
  const random = randomUUID().replace(/-/g, '').slice(0, SESSION_ID_LENGTH - SESSION_ID_PREFIX.length - SESSION_ID_VERSION.length - 2);
  return `${SESSION_ID_PREFIX}_${SESSION_ID_VERSION}_${random}`;
}

export function generateChildSessionId(parentId: string, index: number): string {
  const hash = createHash('sha256').update(`${parentId}:child:${index}`).digest('hex');
  return `${parentId.slice(0, 8)}-${hash.slice(0, 8)}`;
}

export function generateSessionGroupId(): string {
  return `grp_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function isSessionIdValid(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length < 8 || id.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function isPrefixedSessionId(id: string): boolean {
  return id.startsWith(`${SESSION_ID_PREFIX}_${SESSION_ID_VERSION}_`);
}

export function normalizeSessionId(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export function getShortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

export function getSessionIdPrefix(id: string): string | null {
  const parts = id.split('_');
  if (parts.length >= 2) {
    return parts[0];
  }
  return null;
}

export function getSessionIdVersion(id: string): string | null {
  const parts = id.split('_');
  if (parts.length >= 3) {
    return parts[1];
  }
  return null;
}

export function createSessionHash(sessionId: string, timestamp: number): string {
  const data = `${SESSION_ID_PREFIX}:${SESSION_ID_VERSION}:${sessionId}:${timestamp}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export function parsePrefixedSessionId(id: string): { prefix: string; version: string; random: string } | null {
  const parts = id.split('_');
  if (parts.length !== 3) return null;
  return {
    prefix: parts[0],
    version: parts[1],
    random: parts[2],
  };
}

export function compareSessionIds(id1: string, id2: string): number {
  return id1.localeCompare(id2);
}

export function sortSessionIds(ids: string[]): string[] {
  return [...ids].sort();
}