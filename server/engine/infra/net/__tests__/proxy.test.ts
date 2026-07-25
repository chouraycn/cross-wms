import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseProxyUrl,
  resolveProxyForUrl,
  proxyConfigToUrl,
  createProxyManager,
  type ProxyConfig,
  type ProxyOptions,
} from '../proxy.js';

describe('proxy parseProxyUrl', () => {
  it('should parse HTTP proxy URL without auth', () => {
    const config = parseProxyUrl('http://proxy.example.com:8080');
    expect(config).toEqual({
      type: 'http',
      host: 'proxy.example.com',
      port: 8080,
    });
  });

  it('should parse HTTPS proxy URL with default port', () => {
    const config = parseProxyUrl('https://secure-proxy.example.com');
    expect(config).toEqual({
      type: 'https',
      host: 'secure-proxy.example.com',
      port: 443,
    });
  });

  it('should parse SOCKS5 proxy URL with credentials', () => {
    const config = parseProxyUrl('socks5://user:pass@socks-proxy.com:1080');
    expect(config).toEqual({
      type: 'socks5',
      host: 'socks-proxy.com',
      port: 1080,
      username: 'user',
      password: 'pass',
    });
  });

  it('should parse SOCKS4 proxy URL', () => {
    const config = parseProxyUrl('socks4://10.0.0.1:3128');
    expect(config).toEqual({
      type: 'socks4',
      host: '10.0.0.1',
      port: 3128,
    });
  });

  it('should parse SOCKS4a proxy URL', () => {
    const config = parseProxyUrl('socks4a://proxy.local:9050');
    expect(config).toEqual({
      type: 'socks4a',
      host: 'proxy.local',
      port: 9050,
    });
  });

  it('should parse SOCKS5h proxy URL', () => {
    const config = parseProxyUrl('socks5h://tor-proxy.local:9050');
    expect(config).toEqual({
      type: 'socks5h',
      host: 'tor-proxy.local',
      port: 9050,
    });
  });

  it('should decode URL-encoded credentials', () => {
    const config = parseProxyUrl('http://user%40name:p%40ss%3Aword@proxy.com:8080');
    expect(config.username).toBe('user@name');
    expect(config.password).toBe('p@ss:word');
  });

  it('should use default port 80 for HTTP without port', () => {
    const config = parseProxyUrl('http://proxy.com');
    expect(config.port).toBe(80);
  });

  it('should use default port 1080 for SOCKS without port', () => {
    const config = parseProxyUrl('socks5://proxy.com');
    expect(config.port).toBe(1080);
  });

  it('should throw error for unsupported protocol', () => {
    expect(() => parseProxyUrl('ftp://proxy.com')).toThrow(
      'Unsupported proxy protocol: ftp'
    );
  });

  it('should handle username without password', () => {
    const config = parseProxyUrl('http://user@proxy.com:8080');
    expect(config.username).toBe('user');
    expect(config.password).toBeUndefined();
  });
});

describe('proxy resolveProxyForUrl', () => {
  it('should return undefined when no proxy configured', () => {
    const proxy = resolveProxyForUrl('http://example.com', {});
    expect(proxy).toBeUndefined();
  });

  it('should use direct proxy configuration', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'direct-proxy.com',
      port: 8080,
    };
    const proxy = resolveProxyForUrl('http://example.com', { proxy: proxyConfig });
    expect(proxy).toEqual(proxyConfig);
  });

  it('should bypass proxy for noProxy hosts', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    const proxy = resolveProxyForUrl('http://localhost', {
      proxy: proxyConfig,
      noProxy: ['localhost'],
    });
    expect(proxy).toBeUndefined();
  });

  it('should use httpProxy for HTTP URLs', () => {
    const proxy = resolveProxyForUrl('http://example.com', {
      env: {
        httpProxy: 'http://http-proxy.com:8080',
        httpsProxy: 'http://https-proxy.com:8080',
      },
    });
    expect(proxy?.host).toBe('http-proxy.com');
  });

  it('should use httpsProxy for HTTPS URLs', () => {
    const proxy = resolveProxyForUrl('https://example.com', {
      env: {
        httpProxy: 'http://http-proxy.com:8080',
        httpsProxy: 'http://https-proxy.com:8080',
      },
    });
    expect(proxy?.host).toBe('https-proxy.com');
  });

  it('should fall back to allProxy for HTTP URLs', () => {
    const proxy = resolveProxyForUrl('http://example.com', {
      env: {
        allProxy: 'http://all-proxy.com:8080',
      },
    });
    expect(proxy?.host).toBe('all-proxy.com');
  });

  it('should fall back to httpProxy for HTTPS URLs when httpsProxy not set', () => {
    const proxy = resolveProxyForUrl('https://example.com', {
      env: {
        httpProxy: 'http://http-proxy.com:8080',
      },
    });
    expect(proxy?.host).toBe('http-proxy.com');
  });

  it('should fall back to allProxy for HTTPS URLs when httpsProxy not set', () => {
    const proxy = resolveProxyForUrl('https://example.com', {
      env: {
        allProxy: 'http://all-proxy.com:8080',
      },
    });
    expect(proxy?.host).toBe('all-proxy.com');
  });

  it('should prioritize direct proxy over env config', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'direct-proxy.com',
      port: 8080,
    };
    const proxy = resolveProxyForUrl('http://example.com', {
      proxy: proxyConfig,
      env: {
        httpProxy: 'http://env-proxy.com:8080',
      },
    });
    expect(proxy).toEqual(proxyConfig);
  });

  it('should handle URL object as input', () => {
    const url = new URL('http://example.com');
    const proxy = resolveProxyForUrl(url, {
      env: {
        httpProxy: 'http://proxy.com:8080',
      },
    });
    expect(proxy?.host).toBe('proxy.com');
  });

  it('should bypass proxy with wildcard noProxy', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    const proxy = resolveProxyForUrl('http://example.com', {
      proxy: proxyConfig,
      noProxy: ['*'],
    });
    expect(proxy).toBeUndefined();
  });

  it('should bypass proxy for domain suffix in noProxy', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    const proxy = resolveProxyForUrl('http://sub.example.com', {
      proxy: proxyConfig,
      noProxy: ['.example.com'],
    });
    expect(proxy).toBeUndefined();
  });
});

describe('proxy proxyConfigToUrl', () => {
  it('should convert config to URL without auth', () => {
    const config: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    expect(proxyConfigToUrl(config)).toBe('http://proxy.com:8080');
  });

  it('should convert config to URL with username and password', () => {
    const config: ProxyConfig = {
      type: 'socks5',
      host: 'proxy.com',
      port: 1080,
      username: 'user',
      password: 'pass',
    };
    expect(proxyConfigToUrl(config)).toBe('socks5://user:pass@proxy.com:1080');
  });

  it('should encode special characters in credentials', () => {
    const config: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
      username: 'user@domain',
      password: 'pass:word',
    };
    expect(proxyConfigToUrl(config)).toBe(
      'http://user%40domain:pass%3Aword@proxy.com:8080'
    );
  });

  it('should handle username without password', () => {
    const config: ProxyConfig = {
      type: 'https',
      host: 'proxy.com',
      port: 443,
      username: 'user',
    };
    expect(proxyConfigToUrl(config)).toBe('https://user@proxy.com:443');
  });

  it('should convert SOCKS4a config', () => {
    const config: ProxyConfig = {
      type: 'socks4a',
      host: 'proxy.local',
      port: 9050,
    };
    expect(proxyConfigToUrl(config)).toBe('socks4a://proxy.local:9050');
  });
});

describe('proxy createProxyManager', () => {
  it('should create manager with default options', () => {
    const manager = createProxyManager();
    expect(manager.isEnabled()).toBe(false);
  });

  it('should create manager with initial proxy config', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    const manager = createProxyManager({ proxy: proxyConfig });
    expect(manager.isEnabled()).toBe(true);
  });

  it('should get proxy for URL', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    const manager = createProxyManager({ proxy: proxyConfig });
    const proxy = manager.getProxyForUrl('http://example.com');
    expect(proxy).toEqual(proxyConfig);
  });

  it('should return undefined when no proxy configured', () => {
    const manager = createProxyManager({});
    const proxy = manager.getProxyForUrl('http://example.com');
    expect(proxy).toBeUndefined();
  });

  it('should update options dynamically', () => {
    const manager = createProxyManager();
    expect(manager.isEnabled()).toBe(false);

    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    manager.setOptions({ proxy: proxyConfig });
    expect(manager.isEnabled()).toBe(true);
  });

  it('should detect enabled proxy from env config', () => {
    const manager = createProxyManager({
      env: {
        httpProxy: 'http://env-proxy.com:8080',
      },
    });
    expect(manager.isEnabled()).toBe(true);
  });

  it('should handle URL object in getProxyForUrl', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    const manager = createProxyManager({ proxy: proxyConfig });
    const url = new URL('http://example.com');
    const proxy = manager.getProxyForUrl(url);
    expect(proxy).toEqual(proxyConfig);
  });

  it('should bypass proxy with noProxy configuration', () => {
    const proxyConfig: ProxyConfig = {
      type: 'http',
      host: 'proxy.com',
      port: 8080,
    };
    const manager = createProxyManager({
      proxy: proxyConfig,
      noProxy: ['localhost'],
    });
    const proxy = manager.getProxyForUrl('http://localhost');
    expect(proxy).toBeUndefined();
  });

  it('should handle allProxy env variable', () => {
    const manager = createProxyManager({
      env: {
        allProxy: 'http://all-proxy.com:8080',
      },
    });
    expect(manager.isEnabled()).toBe(true);
  });
});

describe('proxy integration tests', () => {
  it('should maintain consistency between parse and toUrl', () => {
    const originalUrl = 'http://user:p%40ss@proxy.example.com:8080';
    const config = parseProxyUrl(originalUrl);
    const reconstructedUrl = proxyConfigToUrl(config);
    expect(reconstructedUrl).toBe('http://user:p%40ss@proxy.example.com:8080');
  });

  it('should handle round-trip with SOCKS5', () => {
    const originalUrl = 'socks5://admin:secret@socks.example.com:1080';
    const config = parseProxyUrl(originalUrl);
    const reconstructedUrl = proxyConfigToUrl(config);
    expect(reconstructedUrl).toBe(originalUrl);
  });

  it('should resolve proxy chain correctly', () => {
    const manager = createProxyManager({
      env: {
        httpProxy: 'http://env-proxy.com:8080',
        httpsProxy: 'https://secure-proxy.com:443',
      },
    });

    const httpProxy = manager.getProxyForUrl('http://example.com');
    expect(httpProxy?.host).toBe('env-proxy.com');

    const httpsProxy = manager.getProxyForUrl('https://example.com');
    expect(httpsProxy?.host).toBe('secure-proxy.com');
  });
});