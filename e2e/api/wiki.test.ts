import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import wikiRouter from '../../server/routes/wikiService.js';

describe('Wiki API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/wiki', wikiRouter);

  describe('GET /api/wiki/stats', () => {
    it('应该返回统计信息', async () => {
      const response = await request(app)
        .get('/api/wiki/stats');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('stats');
    });
  });

  describe('GET /api/wiki/recent', () => {
    it('应该返回最近条目', async () => {
      const response = await request(app)
        .get('/api/wiki/recent');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('entries');
      expect(Array.isArray(response.body.entries)).toBe(true);
    });

    it('应该支持 limit 参数', async () => {
      const response = await request(app)
        .get('/api/wiki/recent?limit=5');

      expect(response.status).toBe(200);
      expect(response.body.entries.length).toBeLessThanOrEqual(5);
    });
  });

  describe('POST /api/wiki/search', () => {
    it('应该返回 400 当 query 为空', async () => {
      const response = await request(app)
        .post('/api/wiki/search')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/wiki/tags', () => {
    it('应该返回所有标签', async () => {
      const response = await request(app)
        .get('/api/wiki/tags');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tags');
    });
  });
});