import { describe, it, expect, beforeEach } from 'vitest';
import { configureGatewayAuth, addApiKey, removeApiKey, authenticateRequest } from '../gatewayAuth.js';
import type { Request } from 'express';

function createMockRequest(headers?: Record<string, string>): Partial<Request> {
  return {
    headers: {
      'x-forwarded-for': '127.0.0.1',
      ...headers,
    },
    ip: '127.0.0.1',
  };
}

describe('Gateway Auth 模块单元测试', () => {
  beforeEach(() => {
    configureGatewayAuth({ apiKeys: [], rateLimitPerMinute: 60 });
  });

  describe('配置管理', () => {
    it('应该能够配置认证参数', () => {
      configureGatewayAuth({
        apiKeys: ['sk-test-1', 'sk-test-2'],
        rateLimitPerMinute: 100,
      });

      expect(() => addApiKey('sk-test-3')).not.toThrow();
      expect(() => removeApiKey('sk-test-1')).not.toThrow();
    });

    it('应该能够添加 API Key', () => {
      expect(() => addApiKey('sk-test')).not.toThrow();
    });

    it('应该能够移除 API Key', () => {
      addApiKey('sk-test');
      expect(() => removeApiKey('sk-test')).not.toThrow();
    });

    it('移除不存在的 API Key 应该不报错', () => {
      expect(() => removeApiKey('sk-nonexistent')).not.toThrow();
    });
  });

  describe('认证流程', () => {
    it('开发模式下（无 API Key 配置）应该允许所有请求', async () => {
      configureGatewayAuth({ apiKeys: [] });
      const req = createMockRequest();
      const result = await authenticateRequest(req as Request);

      expect(result.authenticated).toBe(true);
      expect(result.clientId).toBe('dev');
    });

    it('应该通过有效的 API Key', async () => {
      const apiKey = 'sk-valid-key';
      configureGatewayAuth({ apiKeys: [apiKey] });
      const req = createMockRequest({ authorization: `Bearer ${apiKey}` });
      const result = await authenticateRequest(req as Request);

      expect(result.authenticated).toBe(true);
    });

    it('应该拒绝无效的 API Key', async () => {
      configureGatewayAuth({ apiKeys: ['sk-valid-key'] });
      const req = createMockRequest({ authorization: 'Bearer sk-invalid-key' });
      const result = await authenticateRequest(req as Request);

      expect(result.authenticated).toBe(false);
    });

    it('应该拒绝缺少 API Key 的请求', async () => {
      configureGatewayAuth({ apiKeys: ['sk-valid-key'] });
      const req = createMockRequest();
      const result = await authenticateRequest(req as Request);

      expect(result.authenticated).toBe(false);
    });
  });
});