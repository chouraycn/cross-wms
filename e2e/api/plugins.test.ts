import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import pluginsRouter from '../../server/routes/plugins.js';

/**
 * Plugins API E2E 测试
 *
 * 契约以真实后端 server/routes/plugins.ts / dao/plugins.ts 为准：
 * - 所有响应统一包裹为 { data }（错误为 { error }）
 * - GET  /api/plugins            → 200 { data: { items: [], total } }（分页）
 * - GET  /api/plugins/health     → 200 { data }
 * - GET  /api/plugins/:id        → 200 { data } / 404 { error }
 * - POST /api/plugins/:id/enable → 200 { data } / 404 { error }
 * - POST /api/plugins/:id/disable→ 200 { data } / 404 { error }
 * 注意：后端不存在 /categories、/search 端点（旧测试为臆造契约，已移除）。
 */
describe('Plugins API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/plugins', pluginsRouter);

  describe('GET /api/plugins', () => {
    it('应该返回 { data: { items, total } } 分页结构的插件列表', async () => {
      const response = await request(app).get('/api/plugins');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data).toHaveProperty('total');
    });
  });

  describe('GET /api/plugins/health', () => {
    it('应该返回插件健康状态', async () => {
      const response = await request(app).get('/api/plugins/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('GET /api/plugins/:id', () => {
    it('应该返回 404 当插件不存在', async () => {
      const response = await request(app).get('/api/plugins/nonexistent-id');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/plugins/:id/enable', () => {
    it('应该返回 404 当启用不存在的插件', async () => {
      const response = await request(app).post('/api/plugins/nonexistent-id/enable');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/plugins/:id/disable', () => {
    it('应该返回 404 当禁用不存在的插件', async () => {
      const response = await request(app).post('/api/plugins/nonexistent-id/disable');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/plugins/install/git', () => {
    it('应该返回 400 当缺少 gitUrl 参数', async () => {
      const response = await request(app)
        .post('/api/plugins/install/git')
        .send({})
        .set('Content-Type', 'application/json');
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});
