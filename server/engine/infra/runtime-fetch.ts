// 移植自 openclaw/src/infra/net/runtime-fetch.ts
// 降级：undici dispatcher 依赖简化

export type DispatcherAwareRequestInit = RequestInit & {
  dispatcher?: unknown;
};

/** Checks if the global fetch has been mocked. */
export function isMockedFetch(): boolean {
  return typeof globalThis.fetch !== "undefined" && !(globalThis.fetch as Record<string, unknown>)?.__original;
}

/** Performs a fetch with the runtime dispatcher (if configured). */
export async function fetchWithRuntimeDispatcher(
  url: string | URL,
  init?: DispatcherAwareRequestInit,
): Promise<Response> {
  return globalThis.fetch(url, init);
}

/** Performs a fetch, preferring the runtime dispatcher or falling back to mocked global. */
export async function fetchWithRuntimeDispatcherOrMockedGlobal(
  url: string | URL,
  init?: DispatcherAwareRequestInit,
): Promise<Response> {
  return globalThis.fetch(url, init);
}
