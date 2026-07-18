import { logger } from '../../../logger.js';
import { isTruthyEnvValue } from '../env.js';

export type ProxyEnvConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string[];
  allProxy?: string;
};

const PROXY_ENV_KEYS = {
  http: ['HTTP_PROXY', 'http_proxy'],
  https: ['HTTPS_PROXY', 'https_proxy'],
  all: ['ALL_PROXY', 'all_proxy'],
  no: ['NO_PROXY', 'no_proxy'],
};

function readEnvValue(keys: string[], env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

function parseNoProxy(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

export function readProxyFromEnv(env: NodeJS.ProcessEnv = process.env): ProxyEnvConfig {
  const httpProxy = readEnvValue(PROXY_ENV_KEYS.http, env);
  const httpsProxy = readEnvValue(PROXY_ENV_KEYS.https, env);
  const allProxy = readEnvValue(PROXY_ENV_KEYS.all, env);
  const noProxyRaw = readEnvValue(PROXY_ENV_KEYS.no, env);
  const noProxy = noProxyRaw ? parseNoProxy(noProxyRaw) : undefined;

  const config: ProxyEnvConfig = {};
  if (httpProxy) config.httpProxy = httpProxy;
  if (httpsProxy) config.httpsProxy = httpsProxy;
  if (allProxy) config.allProxy = allProxy;
  if (noProxy) config.noProxy = noProxy;

  return config;
}

export function shouldBypassProxy(hostname: string, noProxy: string[] = []): boolean {
  const lower = hostname.toLowerCase();
  for (const pattern of noProxy) {
    if (pattern === '*') return true;
    if (pattern.startsWith('.')) {
      if (lower.endsWith(pattern) || lower === pattern.slice(1)) return true;
    }
    if (lower === pattern) return true;
    if (lower.endsWith('.' + pattern)) return true;
  }
  return false;
}

export function isProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = readProxyFromEnv(env);
  return !!(config.httpProxy || config.httpsProxy || config.allProxy);
}
