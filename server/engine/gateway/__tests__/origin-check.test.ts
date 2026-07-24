// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkBrowserOrigin } from '../origin-check.js';

describe('origin-check 浏览器 Origin 校验', () => {
  describe('缺失或非法 Origin', () => {
    it('未提供 origin 应拒绝', () => {
      const result = checkBrowserOrigin({ requestHost: 'example.com' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('origin missing or invalid');
    });

    it('origin 为空字符串应拒绝', () => {
      const result = checkBrowserOrigin({ requestHost: 'example.com', origin: '' });
      expect(result.ok).toBe(false);
    });

    it('origin 为 "null" 字符串应拒绝', () => {
      const result = checkBrowserOrigin({ requestHost: 'example.com', origin: 'null' });
      expect(result.ok).toBe(false);
    });

    it('非法 URL 应拒绝', () => {
      const result = checkBrowserOrigin({ requestHost: 'example.com', origin: 'not-a-url' });
      expect(result.ok).toBe(false);
    });
  });

  describe('allowlist 匹配', () => {
    it('origin 在 allowlist 中应通过 matchedBy=allowlist', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://example.com',
        allowedOrigins: ['https://example.com'],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matchedBy).toBe('allowlist');
      }
    });

    it('allowlist 通配符 "*" 应允许任意 origin', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://anywhere.com',
        allowedOrigins: ['*'],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matchedBy).toBe('allowlist');
      }
    });

    it('allowlist 大小写不敏感（应规范化）', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://EXAMPLE.com',
        allowedOrigins: ['https://example.com'],
      });
      expect(result.ok).toBe(true);
    });

    it('allowlist 中空白条目应被过滤', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://example.com',
        allowedOrigins: ['   ', 'https://example.com'],
      });
      expect(result.ok).toBe(true);
    });

    it('origin 不在 allowlist 中且无其他匹配应拒绝', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://evil.com',
        allowedOrigins: ['https://example.com'],
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('origin not allowed');
    });
  });

  describe('host-header-fallback', () => {
    it('allowHostHeaderOriginFallback=true 且 origin host 等于 requestHost 应通过', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://example.com',
        allowHostHeaderOriginFallback: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matchedBy).toBe('host-header-fallback');
      }
    });

    it('allowHostHeaderOriginFallback=false 时不应使用 host-header-fallback', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://example.com',
        allowHostHeaderOriginFallback: false,
      });
      // 公网 host 不属于 private/same-origin，应拒绝
      expect(result.ok).toBe(false);
    });
  });

  describe('private-same-origin', () => {
    it('私有 IP 同主机且 isLocalClient 非显式 false 时应通过', () => {
      const result = checkBrowserOrigin({
        requestHost: '192.168.1.10',
        origin: 'https://192.168.1.10',
        isLocalClient: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matchedBy).toBe('private-same-origin');
      }
    });

    it('loopback 主机同源且 isLocalClient=true 时应通过', () => {
      const result = checkBrowserOrigin({
        requestHost: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        isLocalClient: true,
      });
      expect(result.ok).toBe(true);
    });

    it('loopback 主机同源但 isLocalClient=false 时应拒绝', () => {
      const result = checkBrowserOrigin({
        requestHost: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        isLocalClient: false,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('local-loopback fallback', () => {
    it('isLocalClient=true 且 origin hostname 为 loopback 时应通过', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'http://127.0.0.1:5173',
        isLocalClient: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matchedBy).toBe('local-loopback');
      }
    });

    it('isLocalClient=false 时不应使用 local-loopback fallback', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'http://127.0.0.1:5173',
        isLocalClient: false,
      });
      expect(result.ok).toBe(false);
    });

    it('isLocalClient=true 但 origin hostname 非 loopback 时不应使用 local-loopback fallback', () => {
      const result = checkBrowserOrigin({
        requestHost: 'example.com',
        origin: 'https://evil.com',
        isLocalClient: true,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('trusted same-origin 后缀', () => {
    it('.ts.net 后缀同源时应通过 private-same-origin', () => {
      const result = checkBrowserOrigin({
        requestHost: 'machine.ts.net',
        origin: 'https://machine.ts.net',
        isLocalClient: false,
      });
      expect(result.ok).toBe(true);
    });

    it('.local 后缀同源时应通过 private-same-origin', () => {
      const result = checkBrowserOrigin({
        requestHost: 'raspberry.local',
        origin: 'http://raspberry.local',
        isLocalClient: false,
      });
      expect(result.ok).toBe(true);
    });
  });
});
