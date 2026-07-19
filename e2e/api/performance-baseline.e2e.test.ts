/**
 * 性能基线测试
 *
 * 为关键 API 路径建立性能基线，确保响应时间在可接受范围内。
 * 这些测试不验证业务逻辑，只关注响应时间。
 *
 * 注意：性能阈值设置为宽松值，避免在 CI 环境中因机器性能差异导致误报。
 */

import { describe, it, expect } from 'vitest';
import { createTestClient } from './utils/test-client.js';
import agentsRouter from '../../server/routes/agents.js';
import modelsRouter from '../../server/routes/models.js';
import wikiRouter from '../../server/routes/wikiService.js';
import pluginsRouter from '../../server/routes/plugins.js';

// 性能阈值（单位：毫秒）
const THRESHOLDS = {
  AGENTS_LIST: 1000,
  MODELS_LIST: 1500,
  WIKI_STATS: 800,
  PLUGINS_LIST: 1000,
  PACKAGE_IMPORT: 500,
};

describe('性能基线测试', () => {
  describe('API 响应时间', () => {
    it(`GET /api/agents 应在 ${THRESHOLDS.AGENTS_LIST}ms 内响应`, async () => {
      const client = createTestClient(agentsRouter, '/api/agents');
      const start = Date.now();
      const res = await client.get('/');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(THRESHOLDS.AGENTS_LIST);
    });

    it(`GET /api/models 应在 ${THRESHOLDS.MODELS_LIST}ms 内响应`, async () => {
      const client = createTestClient(modelsRouter, '/api/models');
      const start = Date.now();
      const res = await client.get('/');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(THRESHOLDS.MODELS_LIST);
    });

    it(`GET /api/wiki/stats 应在 ${THRESHOLDS.WIKI_STATS}ms 内响应`, async () => {
      const client = createTestClient(wikiRouter, '/api/wiki');
      const start = Date.now();
      const res = await client.get('/stats');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(THRESHOLDS.WIKI_STATS);
    });

    it(`GET /api/plugins/ 应在 ${THRESHOLDS.PLUGINS_LIST}ms 内响应`, async () => {
      const client = createTestClient(pluginsRouter, '/api/plugins');
      const start = Date.now();
      const res = await client.get('/');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(THRESHOLDS.PLUGINS_LIST);
    });
  });

  describe('包加载时间', () => {
    it(`@cdf-know/llm-core 应在 ${THRESHOLDS.PACKAGE_IMPORT}ms 内加载`, async () => {
      const start = Date.now();
      await import('@cdf-know/llm-core');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(THRESHOLDS.PACKAGE_IMPORT);
    });

    it(`@cdf-know/gateway-protocol 应在 ${THRESHOLDS.PACKAGE_IMPORT}ms 内加载`, async () => {
      const start = Date.now();
      await import('@cdf-know/gateway-protocol');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(THRESHOLDS.PACKAGE_IMPORT);
    });

    it(`@cdf-know/agent-core 应在 ${THRESHOLDS.PACKAGE_IMPORT}ms 内加载`, async () => {
      const start = Date.now();
      await import('@cdf-know/agent-core');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(THRESHOLDS.PACKAGE_IMPORT);
    });
  });
});
