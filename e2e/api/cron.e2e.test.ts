/**
 * Cron API E2E 测试
 *
 * 契约以真实后端 server/routes/cron.ts 为准：
 * - GET    /api/cron            → 200 { success: true, data, total }
 * - POST   /api/cron            → 201 { success: true, data } / 400
 * - GET    /api/cron/:id        → 200 { success: true, data } / 404
 * - PUT    /api/cron/:id        → 200 { success: true, data } / 404
 * - DELETE /api/cron/:id        → 200 { success: true, deleted } / 404
 * - POST   /api/cron/parse      → 200 { success: true, data } / 400
 */

import { describe, it, expect } from 'vitest';
import { createTestClient } from './utils/test-client.js';
import cronRouter from '../../server/routes/cron.js';

describe('Cron API E2E 测试', () => {
  const client = createTestClient(cronRouter, '/api/cron');

  let testJobId: string;

  describe('POST /api/cron/parse', () => {
    it('应该返回 400 当缺少 cron 表达式', async () => {
      const res = await client.post('/parse', {});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('应该解析有效的 cron 表达式', async () => {
      const res = await client.post('/parse', {
        cron: '*/5 * * * *',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('expression');
      expect(res.body.data).toHaveProperty('nextRunAt');
      expect(res.body.data).toHaveProperty('nextRunAtIso');
    });

    it('应该返回 400 当 cron 表达式无效', async () => {
      const res = await client.post('/parse', {
        cron: 'invalid-cron-expr',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/cron', () => {
    it('应该列出 cron 任务', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('POST /api/cron', () => {
    it('应该返回 400 当缺少 cronExpression', async () => {
      const res = await client.post('/', {
        name: '测试任务',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('应该创建 cron 任务', async () => {
      const res = await client.post('/', {
        name: 'E2E 测试任务',
        cronExpression: '0 */1 * * *',
        description: '每小时执行一次的测试任务',
        payload: {
          kind: 'systemEvent',
          text: 'e2e test event',
        },
        enabled: true,
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('name', 'E2E 测试任务');
      testJobId = res.body.data.id;
    });

    it('创建的任务应该出现在列表中', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      const found = res.body.data.some((j: any) => j.id === testJobId);
      expect(found).toBe(true);
    });
  });

  describe('GET /api/cron/:id', () => {
    it('应该获取单个 cron 任务详情', async () => {
      const res = await client.get(`/${testJobId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('id', testJobId);
      expect(res.body.data).toHaveProperty('name', 'E2E 测试任务');
    });

    it('应该返回 404 当任务不存在', async () => {
      const res = await client.get('/nonexistent-job-xyz-123');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/cron/:id', () => {
    it('应该更新 cron 任务', async () => {
      const res = await client.put(`/${testJobId}`, {
        name: '更新后的 E2E 测试任务',
        description: '更新后的描述',
        enabled: false,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('name', '更新后的 E2E 测试任务');
      expect(res.body.data).toHaveProperty('enabled', false);
    });

    it('应该返回 404 当更新不存在的任务', async () => {
      const res = await client.put('/nonexistent-job-xyz-123', {
        name: '不存在的任务',
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  describe('DELETE /api/cron/:id', () => {
    it('应该删除 cron 任务', async () => {
      const res = await client.delete(`/${testJobId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('deleted', testJobId);
    });

    it('应该返回 404 当删除不存在的任务', async () => {
      const res = await client.delete('/nonexistent-job-xyz-123');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
    });

    it('删除后应该查询不到', async () => {
      const res = await client.get(`/${testJobId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('手动触发（模拟）', () => {
    let triggerJobId: string;

    it('先创建一个任务用于手动触发测试', async () => {
      const res = await client.post('/', {
        name: '手动触发测试任务',
        cronExpression: '0 0 1 1 *',
        payload: {
          kind: 'agentTurn',
          message: '手动触发测试',
        },
      });
      expect(res.status).toBe(201);
      triggerJobId = res.body.data.id;
    });

    it('任务存在且可以获取详情', async () => {
      const res = await client.get(`/${triggerJobId}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('id', triggerJobId);
    });

    it('清理手动触发测试任务', async () => {
      const res = await client.delete(`/${triggerJobId}`);
      expect(res.status).toBe(200);
    });
  });
});
