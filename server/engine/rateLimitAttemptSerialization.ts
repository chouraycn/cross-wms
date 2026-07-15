/**
 * 速率限制序列化 — 参考 OpenClaw gateway/rate-limit-attempt-serialization.ts
 *
 * 序列化每个 IP/作用域的限制器尝试，确保并发失败正确计数。
 */

import { AUTH_RATE_LIMIT_SCOPE_DEFAULT } from './authRateLimit.js';

const pendingAttempts = new Map<string, Promise<void>>();

function normalizeScope(scope: string | undefined): string {
  return (scope ?? AUTH_RATE_LIMIT_SCOPE_DEFAULT).trim() || AUTH_RATE_LIMIT_SCOPE_DEFAULT;
}

function normalizeRateLimitClientIp(ip: string | undefined): string {
  return ip?.trim() || 'unknown';
}

function buildSerializationKey(ip: string | undefined, scope: string | undefined): string {
  return `${normalizeScope(scope)}:${normalizeRateLimitClientIp(ip)}`;
}

export async function withSerializedKeyedAttempt<T>(params: {
  key: string;
  run: () => Promise<T>;
}): Promise<T> {
  const key = params.key;
  const previous = pendingAttempts.get(key) ?? Promise.resolve();

  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  const tail = previous.catch(() => {}).then(() => current);
  pendingAttempts.set(key, tail);

  await previous.catch(() => {});

  try {
    return await params.run();
  } finally {
    releaseCurrent();
    if (pendingAttempts.get(key) === tail) {
      pendingAttempts.delete(key);
    }
  }
}

export async function withSerializedRateLimitAttempt<T>(params: {
  ip: string | undefined;
  scope: string | undefined;
  run: () => Promise<T>;
}): Promise<T> {
  return withSerializedKeyedAttempt({
    key: buildSerializationKey(params.ip, params.scope),
    run: params.run,
  });
}