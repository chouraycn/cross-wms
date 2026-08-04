/**
 * Memory API 契约测试
 *
 * 锁定 /api/memory 端点的 CRUD 契约（路由源：server/routes/memory.ts）：
 * - GET    /api/memory            → 200 { content }
 * - POST   /api/memory            → 200 { ok: true } / 400
 * - GET    /api/memory/stats      → 200
 * - GET    /api/memory/list       → 200 { memories, total, limit, offset, hasMore }
 * - GET    /api/memory/search     → 200 { results } / 400
 * - POST   /api/memory/search     → 200 { results } / 400
 * - POST   /api/memory/add        → 200 { id, success } / 400
 * - GET    /api/memory/:id        → 200 记忆详情 / 400 / 404
 * - PUT    /api/memory/:id        → 200 { success } / 404
 * - DELETE /api/memory/:id        → 200 { success } / 400 / 404
 * - POST   /api/memory/batch-delete   → 200 { success, deleted } / 400
 * - POST   /api/memory/batch-category → 200 { success, updated } / 400
 *
 * 使用 supertest 直接驱动 Express app（挂载真实路由），
 * 仅校验响应格式、状态码与必要字段。
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import memoryRouter from '../../server/routes/memory.js';

describe('Memory API 契约测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/memory', memoryRouter);

  let testMemoryId: number;

  describe('GET /api/memory', () => {
    it('应返回 200 及 { content }', async () => {
      const response = await request(app).get('/api/memory');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('content');
    });
  });

  describe('POST /api/memory', () => {
    it('应返回 200 及 { ok: true }', async () => {
      const response = await request(app)
        .post('/api/memory')
        .send({ content: '契约测试内存内容' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
    });

    it('应返回 400 当 content 不是字符串', async () => {
      const response = await request(app)
        .post('/api/memory')
        .send({ content: 123 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/memory/stats', () => {
    it('应返回 200', async () => {
      const response = await request(app).get('/api/memory/stats');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/memory/list', () => {
    it('应返回 200 及分页结构', async () => {
      const response = await request(app).get('/api/memory/list');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('memories');
      expect(Array.isArray(response.body.memories)).toBe(true);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(response.body).toHaveProperty('hasMore');
    });

    it('应支持 limit 与 offset 参数', async () => {
      const response = await request(app).get('/api/memory/list?limit=5&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(5);
      expect(response.body.offset).toBe(0);
    });
  });

  describe('POST /api/memory/add', () => {
    it('应返回 200 及 { success, id }', async () => {
      const response = await request(app)
        .post('/api/memory/add')
        .send({ text: '契约测试记忆', category: 'contract', importance: 5 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('id');
      testMemoryId = response.body.id;
    });

    it('应返回 400 当缺少 text', async () => {
      const response = await request(app)
        .post('/api/memory/add')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/memory/:id', () => {
    it('应返回 200 及记忆详情', async () => {
      if (!testMemoryId) {
        const addRes = await request(app)
          .post('/api/memory/add')
          .send({ text: '临时契约测试记忆' })
          .set('Content-Type', 'application/json');
        testMemoryId = addRes.body.id;
      }

      const response = await request(app).get(`/api/memory/${testMemoryId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testMemoryId);
      expect(response.body).toHaveProperty('text');
    });

    it('应返回 400 当 id 无效', async () => {
      const response = await request(app).get('/api/memory/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应返回 404 当记忆不存在', async () => {
      const response = await request(app).get('/api/memory/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/memory/:id', () => {
    it('应返回 200 及 { success: true }', async () => {
      if (!testMemoryId) {
        const addRes = await request(app)
          .post('/api/memory/add')
          .send({ text: '临时契约测试记忆' })
          .set('Content-Type', 'application/json');
        testMemoryId = addRes.body.id;
      }

      const response = await request(app)
        .put(`/api/memory/${testMemoryId}`)
        .send({ text: '更新后的契约测试记忆', category: 'updated' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('应返回 404 当更新不存在的记忆', async () => {
      const response = await request(app)
        .put('/api/memory/999999')
        .send({ text: '不存在' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/memory/search', () => {
    it('应返回 400 当缺少 query', async () => {
      const response = await request(app).get('/api/memory/search');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应返回 200 及 { results }', async () => {
      const response = await request(app).get('/api/memory/search?query=契约&topK=3');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe('POST /api/memory/search', () => {
    it('应返回 400 当缺少 query', async () => {
      const response = await request(app)
        .post('/api/memory/search')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应返回 200 及 { results }', async () => {
      const response = await request(app)
        .post('/api/memory/search')
        .send({ query: '契约测试', topK: 5 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe('POST /api/memory/batch-delete', () => {
    it('应返回 400 当 ids 不是数组', async () => {
      const response = await request(app)
        .post('/api/memory/batch-delete')
        .send({ ids: 'not-an-array' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应返回 200 及 { success, deleted }', async () => {
      const add1 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量删除契约测试1' })
        .set('Content-Type', 'application/json');
      const add2 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量删除契约测试2' })
        .set('Content-Type', 'application/json');

      const response = await request(app)
        .post('/api/memory/batch-delete')
        .send({ ids: [add1.body.id, add2.body.id] })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted');
    });
  });

  describe('POST /api/memory/batch-category', () => {
    it('应返回 400 当参数无效', async () => {
      const response = await request(app)
        .post('/api/memory/batch-category')
        .send({ ids: 'not-array', category: 123 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应返回 200 及 { success, updated }', async () => {
      const add1 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量分类契约测试1' })
        .set('Content-Type', 'application/json');
      const add2 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量分类契约测试2' })
        .set('Content-Type', 'application/json');

      const response = await request(app)
        .post('/api/memory/batch-category')
        .send({ ids: [add1.body.id, add2.body.id], category: 'contract-batch' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updated');
    });
  });

  describe('DELETE /api/memory/:id', () => {
    it('应返回 400 当 id 无效', async () => {
      const response = await request(app).delete('/api/memory/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应返回 404 当删除不存在的记忆', async () => {
      const response = await request(app).delete('/api/memory/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/memory/backfill', () => {
    it('应返回 200 触发 embedding 回填', async () => {
      const response = await request(app).post('/api/memory/backfill');

      expect(response.status).toBe(200);
    });
  });
});
