// 移植自 openclaw/src/infra/undici-family-policy.ts
// 降级：undici AutoSelectFamily 依赖简化

export type UndiciAutoSelectFamilyOptions = {
  autoSelectFamily?: boolean;
  autoSelectFamilyAttemptTimeout?: number;
};

/** Resolves undici auto-select-family options. */
export function resolveUndiciAutoSelectFamily(options?: {
  autoSelectFamily?: boolean;
  autoSelectFamilyAttemptTimeoutMs?: number;
}): UndiciAutoSelectFamilyOptions {
  return {
    autoSelectFamily: options?.autoSelectFamily ?? true,
    ...(options?.autoSelectFamilyAttemptTimeoutMs ? { autoSelectFamilyAttemptTimeout: options.autoSelectFamilyAttemptTimeoutMs } : {}),
  };
}

/** Creates undici auto-select-family connect options. */
export function createUndiciAutoSelectFamilyConnectOptions(options?: {
  autoSelectFamily?: boolean;
  autoSelectFamilyAttemptTimeoutMs?: number;
}): UndiciAutoSelectFamilyOptions {
  return resolveUndiciAutoSelectFamily(options);
}

/** Resolves undici auto-select-family connect options from config. */
export function resolveUndiciAutoSelectFamilyConnectOptions(_cfg?: unknown): UndiciAutoSelectFamilyOptions {
  return resolveUndiciAutoSelectFamily();
}

/** Runs a callback with temporarily overridden auto-select-family settings. */
export async function withTemporaryUndiciAutoSelectFamily<T>(
  _options: UndiciAutoSelectFamilyOptions,
  callback: () => Promise<T>,
): Promise<T> {
  // Simplified: no real undici state to modify
  return callback();
}
