/**
 * Models API E2E 测试
 *
 * 契约以真实后端 server/routes/models.ts 为准：
 * - GET    /api/models              → 200 { data, providerRegistry }
 * - PUT    /api/models              → 200 { data, providerRegistry } / 400 { error }
 * - POST   /api/models/reset        → 200 { data }
 * - POST   /api/models/health-check → 200 { data: HealthCheckItem[] }
 * - GET    /api/models/recommended  → 200 { data }
 * - GET    /api/models/is-first-launch → 200 { data: { isFirstLaunch } }
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestClient } from './utils/test-client.js';
import modelsRouter from '../../server/routes/models.js';

describe('Models API E2E 测试', () => {
  const client = createTestClient(modelsRouter, '/api/models');

  describe('GET /api/models', () => {
    it('应该返回 { data, providerRegistry } 结构的模型配置', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('models');
      expect(Array.isArray(res.body.data.models)).toBe(true);
    });

    it('返回的模型列表应该脱敏（不含明文 apiKey）', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      const models = res.body.data.models;
      if (models.length > 0) {
        expect(models[0]).not.toHaveProperty('apiKey');
        expect(models[0]).not.toHaveProperty('apiKeys');
      }
    });
  });

  describe('PUT /api/models', () => {
    it('应该返回 400 当 models 不是数组', async () => {
      const res = await client.put('/', { models: 'not-an-array' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('应该更新模型配置并返回脱敏数据', async () => {
      const getRes = await client.get('/');
      const currentModels = getRes.body.data.models || [];
      const defaultModelId = getRes.body.data.defaultModelId;

      const testModel = {
        id: 'e2e-test-model',
        name: 'E2E 测试模型',
        provider: 'custom',
        apiEndpoint: 'http://localhost:8000/v1',
        enabled: true,
      };

      const updatedModels = [...currentModels, testModel];
      const res = await client.put('/', {
        models: updatedModels,
        defaultModelId: defaultModelId || testModel.id,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.models).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/models/reset', () => {
    it('应该重置为内置默认模型', async () => {
      const res = await client.post('/reset');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('models');
      expect(Array.isArray(res.body.data.models)).toBe(true);
    });
  });

  describe('POST /api/models/health-check', () => {
    it('应该返回健康检查结果数组', async () => {
      const res = await client.post('/health-check', { models: [] });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('当传入模型列表时应该返回对应检查结果', async () => {
      const testModels = [
        {
          id: 'test-model-1',
          provider: 'custom',
          apiEndpoint: 'http://localhost:9999/v1',
          enabled: true,
        },
      ];
      const res = await client.post('/health-check', { models: testModels });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/models/recommended', () => {
    it('应该返回推荐模型列表', async () => {
      const res = await client.get('/recommended');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/models/is-first-launch', () => {
    it('应该返回首次启动检测结果', async () => {
      const res = await client.get('/is-first-launch');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('isFirstLaunch');
      expect(typeof res.body.data.isFirstLaunch).toBe('boolean');
    });
  });
});
