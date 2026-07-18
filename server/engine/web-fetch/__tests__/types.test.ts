/**
 * Web Fetch Types 单元测试
 *
 * 测试类型定义和默认配置。
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FETCH_CONFIG,
  DOMESTIC_DOMAINS,
  type FetchResult,
  type FetchOptions,
  type ContentExtractRequest,
  type ContentExtractResult,
  type ProxyConfig,
  type FetchRuntimeConfig,
} from '../types.js';

describe('Web Fetch Types', () => {
  describe('DEFAULT_FETCH_CONFIG', () => {
    it('应包含所有必需的配置项', () => {
      expect(DEFAULT_FETCH_CONFIG).toBeDefined();
      expect(DEFAULT_FETCH_CONFIG.defaultTimeoutMs).toBe(30000);
      expect(DEFAULT_FETCH_CONFIG.defaultMaxRetries).toBe(3);
      expect(DEFAULT_FETCH_CONFIG.defaultRetryDelayMs).toBe(1000);
      expect(DEFAULT_FETCH_CONFIG.cacheEnabled).toBe(true);
      expect(DEFAULT_FETCH_CONFIG.defaultCacheTtlMs).toBe(10 * 60 * 1000);
      expect(DEFAULT_FETCH_CONFIG.maxCacheSize).toBe(200);
      expect(DEFAULT_FETCH_CONFIG.defaultMaxContentLength).toBe(5 * 1024 * 1024);
      expect(DEFAULT_FETCH_CONFIG.proxyEnabled).toBe(false);
      expect(DEFAULT_FETCH_CONFIG.defaultProxyType).toBe('auto');
    });

    it('默认配置应为 FetchRuntimeConfig 类型', () => {
      const config: FetchRuntimeConfig = DEFAULT_FETCH_CONFIG;
      expect(config).toBeDefined();
    });
  });

  describe('DOMESTIC_DOMAINS', () => {
    it('应包含常见的国内域名后缀', () => {
      expect(DOMESTIC_DOMAINS).toContain('.cn');
      expect(DOMESTIC_DOMAINS).toContain('.com.cn');
      expect(DOMESTIC_DOMAINS).toContain('.net.cn');
      expect(DOMESTIC_DOMAINS).toContain('.org.cn');
      expect(DOMESTIC_DOMAINS).toContain('.gov.cn');
      expect(DOMESTIC_DOMAINS).toContain('.edu.cn');
    });

    it('应包含常见的国内网站域名', () => {
      expect(DOMESTIC_DOMAINS).toContain('baidu.com');
      expect(DOMESTIC_DOMAINS).toContain('zhihu.com');
      expect(DOMESTIC_DOMAINS).toContain('bilibili.com');
      expect(DOMESTIC_DOMAINS).toContain('weibo.com');
    });

    it('应为非空数组', () => {
      expect(Array.isArray(DOMESTIC_DOMAINS)).toBe(true);
      expect(DOMESTIC_DOMAINS.length).toBeGreaterThan(0);
    });
  });

  describe('类型定义', () => {
    it('FetchResult 应包含必需字段', () => {
      const result: FetchResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com/page',
        contentType: 'text/html',
        content: '<html>...</html>',
        contentLength: 123,
        truncated: false,
        rendered: false,
        provider: 'native-fetch',
        statusCode: 200,
      };
      expect(result.url).toBe('https://example.com');
      expect(result.finalUrl).toBe('https://example.com/page');
      expect(result.statusCode).toBe(200);
    });

    it('FetchResult 可选字段应能正常设置', () => {
      const result: FetchResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com',
        title: '测试页面',
        contentType: 'text/html',
        content: '...',
        contentLength: 3,
        truncated: false,
        rendered: false,
        provider: 'native-fetch',
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        charset: 'utf-8',
        language: 'zh',
      };
      expect(result.title).toBe('测试页面');
      expect(result.charset).toBe('utf-8');
    });

    it('FetchOptions 应支持各种选项', () => {
      const controller = new AbortController();
      const options: FetchOptions = {
        timeoutMs: 10000,
        maxRetries: 5,
        retryDelayMs: 2000,
        useCache: true,
        useProxy: true,
        proxyType: 'auto',
        userAgent: 'TestAgent/1.0',
        extractContent: true,
        extractMode: 'markdown',
        signal: controller.signal,
      };
      expect(options.timeoutMs).toBe(10000);
      expect(options.extractContent).toBe(true);
      expect(options.extractMode).toBe('markdown');
    });

    it('ContentExtractRequest 应包含提取参数', () => {
      const request: ContentExtractRequest = {
        html: '<html>...</html>',
        url: 'https://example.com',
        extractMode: 'text',
        maxLength: 5000,
        selectors: ['.content'],
        excludeSelectors: ['.ad'],
        extractTitle: true,
        extractMetadata: true,
      };
      expect(request.extractMode).toBe('text');
      expect(request.maxLength).toBe(5000);
    });

    it('ContentExtractResult 应包含提取结果', () => {
      const result: ContentExtractResult = {
        content: '提取的内容',
        title: '页面标题',
        contentType: 'text',
        contentLength: 6,
        truncated: false,
        extractorId: 'basic',
        metadata: { description: '页面描述' },
      };
      expect(result.content).toBe('提取的内容');
      expect(result.extractorId).toBe('basic');
    });

    it('ProxyConfig 应支持代理配置', () => {
      const proxy: ProxyConfig = {
        url: 'proxy.example.com:8080',
        type: 'http',
        username: 'user',
        password: 'pass',
      };
      expect(proxy.url).toBe('proxy.example.com:8080');
      expect(proxy.type).toBe('http');
    });
  });
});
