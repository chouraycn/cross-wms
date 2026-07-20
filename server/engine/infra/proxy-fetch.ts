// 移植自 openclaw/src/infra/proxy-fetch.ts
// 降级：undici ProxyAgent 依赖简化

export const PROXY_FETCH_PROXY_URL: string | undefined = undefined;

/** Creates a proxy-aware fetch function. Simplified without undici proxy. */
export function makeProxyFetch(params?: {
  proxyUrl?: string;
  fetchFn?: typeof fetch;
}): typeof fetch {
  return params?.fetchFn ?? globalThis.fetch;
}

/** Gets the proxy URL from a proxy fetch instance. */
export function getProxyUrlFromFetch(_fetchFn?: unknown): string | undefined {
  return undefined;
}

/** Resolves a proxy fetch from environment variables. */
export function resolveProxyFetchFromEnv(params?: {
  fetchFn?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}): typeof fetch {
  const env = params?.env ?? process.env;
  const proxyUrl = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  if (!proxyUrl?.trim()) {
    return params?.fetchFn ?? globalThis.fetch;
  }
  // Simplified: return base fetch without proxy agent
  return params?.fetchFn ?? globalThis.fetch;
}
