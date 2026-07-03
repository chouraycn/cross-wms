import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import memoryRouter from '../../server/routes/memory.js';

describe('Memory API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/memory', memoryRouter);

  describe('GET /api/memory', () => {
    it('应该返回 MEMORY.md 内容', async () => {
      const response = await request(app)
        .get('/api/memory');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('content');
    });
  });

  describe('POST /api/memory', () => {
    it('应该更新 MEMORY.md', async () => {
      const response = await request(app)
        .post('/api/memory')
        .send({ content: '测试内存内容' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
    });

    it('应该返回 400 当 content 不是字符串', async () => {
      const response = await request(app)
        .post('/api/memory')
        .send({ content: 123 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/memory/stats', () => {
    it('应该返回统计信息', async () => {
      const response = await request(app)
        .get('/api/memory/stats');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/memory/list', () => {
    it('应该返回记忆列表', async () => {
      const response = await request(app)
        .get('/api/memory/list');

      expect(response.status).toBe(200);
    });
  });
});