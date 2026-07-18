import { URL } from 'node:url';
import { logger } from '../../../logger.js';
import { assertSafeUrl, type SsrfProtectOptions } from './ssrf-protect.js';
import { resolveProxyForUrl, type ProxyOptions } from './proxy.js';

export type FetchGuardOptions = SsrfProtectOptions & ProxyOptions & {
  allowedMethods?: string[];
  maxRedirects?: number;
  blockPrivateNetwork?: boolean;
};

const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const DEFAULT_MAX_REDIRECTS = 10;

export async function guardFetchRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchGuardOptions = {},
): Promise<void> {
  const url = input instanceof URL ? input : typeof input === 'string' ? new URL(input) : new URL(input.url);
  
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  const method = init?.method?.toUpperCase() ?? 'GET';
  const allowedMethods = options.allowedMethods ?? DEFAULT_ALLOWED_METHODS;
  if (!allowedMethods.includes(method)) {
    throw new Error(`HTTP method ${method} is not allowed`);
  }

  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (maxRedirects < 0) {
    throw new Error('maxRedirects cannot be negative');
  }

  if (options.blockPrivateNetwork !== false) {
    await assertSafeUrl(url, options);
  }
}

export function createFetchGuard(options: FetchGuardOptions = {}) {
  return {
    guard: (input: RequestInfo | URL, init?: RequestInit) => guardFetchRequest(input, init, options),
    getProxyForUrl: (url: string | URL) => resolveProxyForUrl(url, options),
    options,
  };
}

export type FetchGuard = ReturnType<typeof createFetchGuard>;
