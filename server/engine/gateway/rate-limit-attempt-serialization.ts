// Gateway auth 限流序列化。
// 按 IP/scope 串行化限流尝试，使并发失败能正确计数。
// 移植自 openclaw/src/gateway/rate-limit-attempt-serialization.ts。
// 依赖调整：./auth-rate-limit.js 的 AUTH_RATE_LIMIT_SCOPE_DEFAULT、normalizeRateLimitClientIp
// → 本地 _openclaw-stubs.ts（目标 auth-rate-limit.ts 未导出这些符号）。
import {
  AUTH_RATE_LIMIT_SCOPE_DEFAULT,
  normalizeRateLimitClientIp,
} from "./_openclaw-stubs.js";

const pendingAttempts = new Map<string, Promise<void>>();

function normalizeScope(scope: string | undefined): string {
  return (scope ?? AUTH_RATE_LIMIT_SCOPE_DEFAULT).trim() || AUTH_RATE_LIMIT_SCOPE_DEFAULT;
}

function buildSerializationKey(ip: string | undefined, scope: string | undefined): string {
  return `${normalizeScope(scope)}:${normalizeRateLimitClientIp(ip)}`;
}

/** 在同一稳定 key 的先前工作完成后再运行一次尝试。 */
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

/** 在同一 IP/scope 的先前尝试完成后再运行一次限流尝试。 */
export async function withSerializedRateLimitAttempt<T>(params: {
  ip: string | undefined;
  scope: string | undefined;
  run: () => Promise<T>;
}): Promise<T> {
  return await withSerializedKeyedAttempt({
    key: buildSerializationKey(params.ip, params.scope),
    run: params.run,
  });
}
