export type { ProxyType, ProxyConfig, ProxyOptions } from './proxy.js';
export { parseProxyUrl, resolveProxyForUrl, proxyConfigToUrl, createProxyManager } from './proxy.js';

export type { ProxyEnvConfig } from './proxy-env.js';
export { readProxyFromEnv, shouldBypassProxy, isProxyEnabled } from './proxy-env.js';

export type { FetchGuardOptions, FetchGuard } from './fetch-guard.js';
export { guardFetchRequest, createFetchGuard } from './fetch-guard.js';

export { isValidHostname, isReservedTld, normalizeHostname, validateHostname } from './hostname.js';

export type { HttpConnectTunnelOptions, HttpConnectTunnelResult } from './http-connect-tunnel.js';
export { createHttpConnectTunnel, closeHttpConnectTunnel } from './http-connect-tunnel.js';

export type { SsrfProtectOptions } from './ssrf-protect.js';
export { resolveAndValidateHostname, assertSafeUrl, createSsrfGuard } from './ssrf-protect.js';
