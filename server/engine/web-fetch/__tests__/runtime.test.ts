/**
 * Fetch Runtime 单元测试
 *
 * 测试获取运行时的 URL 验证、缓存、重试、内容提取等功能。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FetchRuntime } from '../runtime.js';

vi.mock('../../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Fetch Runtime', () => {
  let runtime: FetchRuntime;

  beforeEach(() => {
    runtime = new FetchRuntime();
  });

  describe('配置管理', () => {
    it('应使用默认配置初始化', () => {
      const config = runtime.getConfig();
      expect(config.defaultTimeoutMs).toBe(30000);
      expect(config.defaultMaxRetries).toBe(3);
      expect(config.cacheEnabled).toBe(true);
      expect(config.proxyEnabled).toBe(false);
    });

    it('应能更新配置', () => {
      runtime.setConfig({ defaultTimeoutMs: 60000, cacheEnabled: false });
      const config = runtime.getConfig();
      expect(config.defaultTimeoutMs).toBe(60000);
      expect(config.cacheEnabled).toBe(false);
    });
  });

  describe('URL 验证', () => {
    it('无效 URL 应抛出错误', async () => {
      await expect(runtime.fetch('not-a-valid-url')).rejects.toThrow();
    });

    it('空 URL 应抛出错误', async () => {
      await expect(runtime.fetch('')).rejects.toThrow();
    });

    it('非 HTTP/HTTPS URL 应抛出错误', async () => {
      await expect(runtime.fetch('ftp://example.com')).rejects.toThrow();
      await expect(runtime.fetch('file:///etc/passwd')).rejects.toThrow();
    });

    it('HTTP URL 应被接受', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'http://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html>content</html>'),
      } as unknown as Response);

      try {
        const result = await runtime.fetch('http://example.com');
        expect(result).toBeDefined();
        expect(result.url).toBe('http://example.com');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('HTTPS URL 应被接受', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html>content</html>'),
      } as unknown as Response);

      try {
        const result = await runtime.fetch('https://example.com');
        expect(result).toBeDefined();
        expect(result.url).toBe('https://example.com');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('缓存功能', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: () => Promise.resolve('<html><body><h1>Test</h1><p>Content</p></body></html>'),
      } as unknown as Response);
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('相同 URL 应命中缓存', async () => {
      await runtime.fetch('https://example.com');
      await runtime.fetch('https://example.com');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('useCache: false 应禁用缓存', async () => {
      await runtime.fetch('https://example.com', { useCache: false });
      await runtime.fetch('https://example.com', { useCache: false });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('clearCache 应清除所有缓存', async () => {
      await runtime.fetch('https://example.com');
      expect(runtime.getCacheSize()).toBeGreaterThan(0);

      runtime.clearCache();
      expect(runtime.getCacheSize()).toBe(0);
    });

    it('不同 URL 不应命中缓存', async () => {
      await runtime.fetch('https://example.com/page1');
      await runtime.fetch('https://example.com/page2');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('重试功能', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('请求失败时应自动重试', async () => {
      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://example.com',
          headers: new Headers({ 'content-type': 'text/html' }),
          text: () => Promise.resolve('<html>success</html>'),
        } as unknown as Response);
      });

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com', {
        maxRetries: 3,
        retryDelayMs: 10,
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
      expect(result.statusCode).toBe(200);
    });

    it('所有重试失败后应抛出错误', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      await expect(
        runtime.fetch('https://example.com', {
          maxRetries: 2,
          retryDelayMs: 10,
        }),
      ).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('HTTP 错误状态码应触发重试', async () => {
      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            url: 'https://example.com',
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          url: 'https://example.com',
          headers: new Headers({ 'content-type': 'text/html' }),
          text: () => Promise.resolve('<html>success</html>'),
        } as unknown as Response);
      });

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com', {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(result.statusCode).toBe(200);
    });
  });

  describe('内容长度限制', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('内容超长时应截断', async () => {
      const longContent = '<html><body>' + 'a'.repeat(10000) + '</body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(longContent),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com', {
        maxContentLength: 1000,
      });

      expect(result.contentLength).toBe(1000);
      expect(result.truncated).toBe(true);
    });

    it('内容未超长时不应截断', async () => {
      const shortContent = '<html>short</html>';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(shortContent),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com', {
        maxContentLength: 10000,
      });

      expect(result.truncated).toBe(false);
    });
  });

  describe('响应处理', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('应返回正确的状态码', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html></html>'),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com');
      expect(result.statusCode).toBe(200);
    });

    it('应返回 Content-Type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: () => Promise.resolve('<html></html>'),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com');
      expect(result.contentType).toContain('text/html');
    });

    it('应提取 charset', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html; charset=gbk' }),
        text: () => Promise.resolve('<html></html>'),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com');
      expect(result.charset).toBe('gbk');
    });

    it('应返回响应头', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({
          'content-type': 'text/html',
          'x-custom': 'test-value',
        }),
        text: () => Promise.resolve('<html></html>'),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com');
      expect(result.headers).toBeDefined();
      expect(result.headers?.['x-custom']).toBe('test-value');
    });

    it('应返回最终 URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com/final-page',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html></html>'),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com/redirect');
      expect(result.url).toBe('https://example.com/redirect');
      expect(result.finalUrl).toBe('https://example.com/final-page');
    });
  });

  describe('内容提取', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('extractContent: true 时应提取内容', async () => {
      const html = `
        <html>
          <head><title>测试页面</title></head>
          <body>
            <main>
              <article>
                <h1>文章标题</h1>
                <p>${'内容'.repeat(100)}</p>
              </article>
            </main>
          </body>
        </html>
      `;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(html),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com', {
        extractContent: true,
        extractMode: 'text',
      });

      expect(result.title).toBeDefined();
      expect(result.title).toContain('测试页面');
    });

    it('extractContent: false 时应返回原始 HTML', async () => {
      const html = '<html><body>raw content</body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(html),
      } as unknown as Response);

      global.fetch = mockFetch;

      const result = await runtime.fetch('https://example.com', {
        extractContent: false,
      });

      expect(result.content).toContain('<html>');
    });
  });

  describe('超时处理', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('超时应抛出错误', async () => {
      const mockFetch = vi.fn().mockImplementation(
        () => new Promise<Response>((_, reject) => {
          setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 100);
        }),
      );

      global.fetch = mockFetch;

      await expect(
        runtime.fetch('https://example.com', {
          timeoutMs: 50,
          maxRetries: 0,
        }),
      ).rejects.toThrow();
    });
  });

  describe('用户代理', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('应使用自定义 User-Agent', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html></html>'),
      } as unknown as Response);

      global.fetch = mockFetch;

      const customUserAgent = 'CustomAgent/1.0';
      await runtime.fetch('https://example.com', {
        userAgent: customUserAgent,
        useCache: false,
      });

      const callArgs = mockFetch.mock.calls[0];
      const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
      expect(headers['User-Agent']).toBe(customUserAgent);
    });
  });
});
