/**
 * Fetch 头部规范化 — 剥离非头部符号
 *
 * 参考 openclaw/src/infra/fetch-headers.ts
 */

type HeadersLike = {
  entries: () => IterableIterator<[string, string]>;
  get: (name: string) => string | null;
  [Symbol.iterator]: () => IterableIterator<[string, string]>;
};

function isHeadersLike(value: object): value is HeadersLike {
  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return true;
  }
  const candidate = value as Partial<HeadersLike>;
  return (
    typeof candidate.entries === "function" &&
    typeof candidate.get === "function" &&
    typeof candidate[Symbol.iterator] === "function"
  );
}

/** 规范化 HeadersInit 记录，使 fetch 只接收 string 键的属性 */
export function normalizeHeadersInitForFetch(
  headers: HeadersInit | undefined,
): HeadersInit | undefined {
  // 某些 fetch 运行时拒绝带 symbol 键的记录；保留 Headers/数组不变
  if (!headers || typeof headers !== "object" || Array.isArray(headers) || isHeadersLike(headers)) {
    return headers;
  }
  if (Object.getOwnPropertySymbols(headers).length === 0) {
    return headers;
  }

  const normalized = Object.create(null) as Record<string, string>;
  const headerRecord = headers as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(headerRecord)) {
    normalized[key] = String(headerRecord[key]);
  }
  return normalized;
}

/** 规范化 request init headers，无变化时不克隆 init 对象 */
export function normalizeRequestInitHeadersForFetch<T extends { headers?: HeadersInit }>(
  init: T | undefined,
): T | undefined {
  if (!init?.headers) {
    return init;
  }
  const headers = normalizeHeadersInitForFetch(init.headers);
  if (headers === init.headers) {
    return init;
  }
  return { ...init, headers } as T;
}
