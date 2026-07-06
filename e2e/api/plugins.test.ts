import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import pluginsRouter from '../../server/routes/plugins.js';

describe('Plugins API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', pluginsRouter);

  describe('GET /api/plugins', () => {
    it('应该返回插件列表', async () => {
      const response = await request(app).get('/api/plugins');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/plugins/:id', () => {
    it('应该返回插件详情', async () => {
      const listResponse = await request(app).get('/api/plugins');
      if (listResponse.body.length > 0) {
        const plugin = listResponse.body[0];
        const response = await request(app).get(`/api/plugins/${plugin.id}`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id', plugin.id);
      }
    });

    it('应该返回 404 当插件不存在', async () => {
      const response = await request(app).get('/api/plugins/nonexistent-id');
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/plugins/:id/enable', () => {
    it('应该启用插件', async () => {
      const listResponse = await request(app).get('/api/plugins');
      if (listResponse.body.length > 0) {
        const plugin = listResponse.body[0];
        const response = await request(app).post(`/api/plugins/${plugin.id}/enable`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('ok', true);
      }
    });
  });

  describe('POST /api/plugins/:id/disable', () => {
    it('应该禁用插件', async () => {
      const listResponse = await request(app).get('/api/plugins');
      if (listResponse.body.length > 0) {
        const plugin = listResponse.body[0];
        const response = await request(app).post(`/api/plugins/${plugin.id}/disable`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('ok', true);
      }
    });
  });

  describe('GET /api/plugins/categories', () => {
    it('应该返回插件分类', async () => {
      const response = await request(app).get('/api/plugins/categories');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/plugins/search', () => {
    it('应该搜索插件', async () => {
      const response = await request(app)
        .post('/api/plugins/search')
        .send({ query: 'test' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});