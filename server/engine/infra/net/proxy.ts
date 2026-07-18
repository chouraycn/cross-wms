import { URL } from 'node:url';
import { logger } from '../../../logger.js';
import { readProxyFromEnv, shouldBypassProxy, type ProxyEnvConfig } from './proxy-env.js';

export type ProxyType = 'http' | 'https' | 'socks4' | 'socks4a' | 'socks5' | 'socks5h';

export type ProxyConfig = {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  noProxy?: string[];
};

export type ProxyOptions = {
  proxy?: ProxyConfig;
  env?: ProxyEnvConfig;
  noProxy?: string[];
};

export function parseProxyUrl(proxyUrl: string): ProxyConfig {
  const url = new URL(proxyUrl);
  const protocol = url.protocol.replace(':', '').toLowerCase();
  
  let type: ProxyType = 'http';
  if (protocol === 'http') type = 'http';
  else if (protocol === 'https') type = 'https';
  else if (protocol === 'socks4') type = 'socks4';
  else if (protocol === 'socks4a') type = 'socks4a';
  else if (protocol === 'socks5') type = 'socks5';
  else if (protocol === 'socks5h') type = 'socks5h';
  else throw new Error(`Unsupported proxy protocol: ${protocol}`);

  const config: ProxyConfig = {
    type,
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : (type === 'http' ? 80 : type === 'https' ? 443 : 1080),
  };

  if (url.username) config.username = decodeURIComponent(url.username);
  if (url.password) config.password = decodeURIComponent(url.password);

  return config;
}

export function resolveProxyForUrl(
  targetUrl: string | URL,
  options: ProxyOptions = {},
): ProxyConfig | undefined {
  const url = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const hostname = url.hostname;
  const isHttps = url.protocol === 'https:';

  const noProxy = options.noProxy ?? options.env?.noProxy ?? [];
  if (shouldBypassProxy(hostname, noProxy)) {
    return undefined;
  }

  if (options.proxy) {
    return options.proxy;
  }

  const env = options.env ?? readProxyFromEnv();
  
  if (isHttps) {
    if (env.httpsProxy) return parseProxyUrl(env.httpsProxy);
    if (env.allProxy) return parseProxyUrl(env.allProxy);
    if (env.httpProxy) return parseProxyUrl(env.httpProxy);
  } else {
    if (env.httpProxy) return parseProxyUrl(env.httpProxy);
    if (env.allProxy) return parseProxyUrl(env.allProxy);
  }

  return undefined;
}

export function proxyConfigToUrl(config: ProxyConfig): string {
  let auth = '';
  if (config.username) {
    auth = encodeURIComponent(config.username);
    if (config.password) {
      auth += ':' + encodeURIComponent(config.password);
    }
    auth += '@';
  }
  return `${config.type}://${auth}${config.host}:${config.port}`;
}

export function createProxyManager(defaultOptions: ProxyOptions = {}) {
  let currentOptions = { ...defaultOptions };

  return {
    setOptions(options: ProxyOptions) {
      currentOptions = { ...options };
    },
    getProxyForUrl(url: string | URL): ProxyConfig | undefined {
      return resolveProxyForUrl(url, currentOptions);
    },
    isEnabled(): boolean {
      return !!(currentOptions.proxy || currentOptions.env?.httpProxy || currentOptions.env?.httpsProxy || currentOptions.env?.allProxy);
    },
  };
}
