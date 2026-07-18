// 移植自 openclaw/src/infra/proxy-fetch.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function makeProxyFetch(...args: unknown[]): unknown {
  throw new Error("not implemented: makeProxyFetch");
}
export function getProxyUrlFromFetch(...args: unknown[]): unknown {
  throw new Error("not implemented: getProxyUrlFromFetch");
}
export function resolveProxyFetchFromEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveProxyFetchFromEnv");
}
export const PROXY_FETCH_PROXY_URL: unknown = undefined;
