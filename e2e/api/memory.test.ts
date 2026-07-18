/**
 * Memory API E2E 测试
 *
 * 契约以真实后端 server/routes/memory.ts 为准：
 * - GET    /api/memory            → 200 { content }
 * - POST   /api/memory            → 200 { ok: true } / 400
 * - GET    /api/memory/stats      → 200 统计信息
 * - GET    /api/memory/list       → 200 { memories, total, ... }
 * - GET    /api/memory/search     → 200 { results } / 400
 * - POST   /api/memory/search     → 200 { results } / 400
 * - POST   /api/memory/add        → 200 { id, success } / 400
 * - GET    /api/memory/:id        → 200 记忆详情 / 400 / 404
 * - PUT    /api/memory/:id        → 200 { success } / 400 / 404
 * - DELETE /api/memory/:id        → 200 { success } / 400 / 404
 * - POST   /api/memory/batch-delete    → 200 { success, deleted } / 400
 * - POST   /api/memory/batch-category  → 200 { success, updated } / 400
 * - POST   /api/memory/backfill   → 200 回填结果
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import memoryRouter from '../../server/routes/memory.js';

describe('Memory API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/memory', memoryRouter);

  let testMemoryId: number;

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
    it('应该返回记忆列表（分页结构）', async () => {
      const response = await request(app)
        .get('/api/memory/list');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('memories');
      expect(Array.isArray(response.body.memories)).toBe(true);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(response.body).toHaveProperty('hasMore');
    });

    it('应该支持 limit 和 offset 参数', async () => {
      const response = await request(app)
        .get('/api/memory/list?limit=5&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(5);
      expect(response.body.offset).toBe(0);
    });
  });

  describe('POST /api/memory/add', () => {
    it('应该存储（添加）记忆', async () => {
      const response = await request(app)
        .post('/api/memory/add')
        .send({
          text: 'E2E 测试记忆内容',
          metadata: { source: 'e2e-test' },
          category: 'test',
          importance: 5,
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('id');
      testMemoryId = response.body.id;
    });

    it('应该返回 400 当缺少 text 参数', async () => {
      const response = await request(app)
        .post('/api/memory/add')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该返回 400 当 text 不是字符串', async () => {
      const response = await request(app)
        .post('/api/memory/add')
        .send({ text: 12345 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/memory/:id', () => {
    it('应该获取记忆详情', async () => {
      if (!testMemoryId) {
        const addRes = await request(app)
          .post('/api/memory/add')
          .send({ text: '临时测试记忆' })
          .set('Content-Type', 'application/json');
        testMemoryId = addRes.body.id;
      }

      const response = await request(app)
        .get(`/api/memory/${testMemoryId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testMemoryId);
      expect(response.body).toHaveProperty('text');
    });

    it('应该返回 400 当 id 无效', async () => {
      const response = await request(app)
        .get('/api/memory/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该返回 404 当记忆不存在', async () => {
      const response = await request(app)
        .get('/api/memory/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/memory/:id', () => {
    it('应该更新记忆', async () => {
      if (!testMemoryId) {
        const addRes = await request(app)
          .post('/api/memory/add')
          .send({ text: '临时测试记忆' })
          .set('Content-Type', 'application/json');
        testMemoryId = addRes.body.id;
      }

      const response = await request(app)
        .put(`/api/memory/${testMemoryId}`)
        .send({
          text: '更新后的 E2E 测试记忆',
          category: 'updated',
          importance: 8,
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('应该返回 404 当更新不存在的记忆', async () => {
      const response = await request(app)
        .put('/api/memory/999999')
        .send({ text: '不存在的记忆' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/memory/search', () => {
    it('应该返回 400 当缺少 query 参数', async () => {
      const response = await request(app)
        .get('/api/memory/search');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该搜索记忆', async () => {
      const response = await request(app)
        .get('/api/memory/search?query=测试&topK=3');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe('POST /api/memory/search', () => {
    it('应该返回 400 当缺少 query', async () => {
      const response = await request(app)
        .post('/api/memory/search')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该搜索记忆（POST 方式）', async () => {
      const response = await request(app)
        .post('/api/memory/search')
        .send({ query: 'E2E 测试', topK: 5 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe('DELETE /api/memory/:id', () => {
    it('应该返回 400 当 id 无效', async () => {
      const response = await request(app)
        .delete('/api/memory/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该返回 404 当删除不存在的记忆', async () => {
      const response = await request(app)
        .delete('/api/memory/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/memory/batch-delete', () => {
    it('应该返回 400 当 ids 不是数组', async () => {
      const response = await request(app)
        .post('/api/memory/batch-delete')
        .send({ ids: 'not-an-array' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该批量删除记忆', async () => {
      const add1 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量删除测试1' })
        .set('Content-Type', 'application/json');
      const add2 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量删除测试2' })
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
    it('应该返回 400 当参数无效', async () => {
      const response = await request(app)
        .post('/api/memory/batch-category')
        .send({ ids: 'not-array', category: 123 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该批量更新记忆分类', async () => {
      const add1 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量分类测试1' })
        .set('Content-Type', 'application/json');
      const add2 = await request(app)
        .post('/api/memory/add')
        .send({ text: '批量分类测试2' })
        .set('Content-Type', 'application/json');

      const response = await request(app)
        .post('/api/memory/batch-category')
        .send({ ids: [add1.body.id, add2.body.id], category: 'e2e-batch' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updated');
    });
  });

  describe('POST /api/memory/backfill', () => {
    it('应该触发 embedding 回填', async () => {
      const response = await request(app)
        .post('/api/memory/backfill');

      expect(response.status).toBe(200);
    });
  });
});
