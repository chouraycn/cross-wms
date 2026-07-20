// 移植自 openclaw/src/infra/undici-global-dispatcher.ts
// 降级：undici Dispatcher 依赖简化

export const DEFAULT_UNDICI_STREAM_TIMEOUT_MS = 300_000;
export let globalUndiciStreamTimeoutMs: number | undefined = DEFAULT_UNDICI_STREAM_TIMEOUT_MS;

/** Ensures the global undici dispatcher has env proxy configured. No-op in cross-wms. */
export function ensureGlobalUndiciEnvProxyDispatcher(_params?: {
  proxyUrl?: string;
  noProxy?: string;
}): void {
  // Simplified: undici global dispatcher not available in cross-wms
}

/** Ensures global undici stream timeouts are set. */
export function ensureGlobalUndiciStreamTimeouts(timeoutMs?: number): void {
  if (timeoutMs !== undefined && timeoutMs > 0) {
    globalUndiciStreamTimeoutMs = timeoutMs;
  }
}

/** Ensures the global undici dispatcher has stream timeout configuration. */
export function ensureGlobalUndiciDispatcherStreamTimeouts(_dispatcher?: unknown, _timeoutMs?: number): void {
  // Simplified: undici dispatcher not available
}

/** Resets global undici stream timeouts for tests. */
export function resetGlobalUndiciStreamTimeoutsForTests(): void {
  globalUndiciStreamTimeoutMs = DEFAULT_UNDICI_STREAM_TIMEOUT_MS;
}

/** Force resets the global dispatcher. No-op in cross-wms. */
export function forceResetGlobalDispatcher(): void {
  // Simplified: no real global dispatcher to reset
}
