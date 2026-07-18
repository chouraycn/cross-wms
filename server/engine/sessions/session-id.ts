/**
 * 会话 ID 生成与解析
 *
 * 提供会话 ID 的生成、验证和解析功能
 */

import crypto from 'crypto';

export const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function looksLikeSessionId(value: string): boolean {
  return SESSION_ID_RE.test(value.trim());
}

export function normalizeSessionId(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim().toLowerCase();
  return looksLikeSessionId(trimmed) ? trimmed : '';
}
