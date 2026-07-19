/**
 * Packages 移植集成 E2E 测试
 *
 * 验证本次从 openclaw 移植到 cross-wms 的 12 个 @cdf-know/* 包在真实运行时能被正确加载。
 * 通过触发依赖这些包的 API 路由，间接验证包的可加载性、导出符号可用性。
 *
 * 覆盖包：
 *   - @cdf-know/llm-core        （经 /api/v1/models 触发）
 *   - @cdf-know/plugin-sdk       （经 /api/v1/plugins 触发）
 *   - @cdf-know/agent-core       （经 /api/v1/agents 触发）
 *   - @cdf-know/markdown-core    （经 /api/v1/wiki 触发）
 *   - @cdf-know/gateway-protocol （经 /api/v1/agents 触发）
 *   - @cdf-know/memory-host-sdk  （经 /api/v1/plugins 触发）
 *   - @cdf-know/model-catalog-core / normalization-core / media-generation-core 等
 */

import { describe, it, expect } from 'vitest';
import { createTestClient } from './utils/test-client.js';
import agentsRouter from '../../server/routes/agents.js';
import pluginsRouter from '../../server/routes/plugins.js';
import modelsRouter from '../../server/routes/models.js';
import wikiRouter from '../../server/routes/wikiService.js';

describe('Packages 移植集成测试', () => {
  describe('GET /api/v1/agents - 验证 @cdf-know/agent-core + gateway-protocol', () => {
    const client = createTestClient(agentsRouter, '/api/agents');

    it('应返回 200 且 data 为数组', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/plugins - 验证 @cdf-know/plugin-sdk + memory-host-sdk', () => {
    const client = createTestClient(pluginsRouter, '/api/plugins');

    it('GET /api/plugins/ 应返回 200', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/models - 验证 @cdf-know/llm-core + model-catalog-core', () => {
    const client = createTestClient(modelsRouter, '/api/models');

    it('应返回 200', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/wiki - 验证 @cdf-know/markdown-core', () => {
    const client = createTestClient(wikiRouter, '/api/wiki');

    it('GET /api/wiki/stats 应返回 200', async () => {
      const res = await client.get('/stats');
      expect(res.status).toBe(200);
    });
  });
});
