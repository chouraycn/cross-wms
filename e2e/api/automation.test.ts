import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import automationRouter from '../../server/routes/automation.js';

/**
 * Automation API E2E 测试
 *
 * 契约以真实后端 server/routes/automation.ts 为准（前端 src/services/automation/api.ts 亦一致）：
 * - 路由挂载点：/api/automation（单数）
 * - GET  /api/automation            → 200 { data: [], total }
 * - POST /api/automation            → 201 <automation> ；必填 name/prompt/taskType
 * - GET  /api/automation/:id        → 200 <automation> / 404 { error }
 * - PUT  /api/automation/:id        → 200 <updated> / 404 { error }
 * - DELETE /api/automation/:id      → 200 { success: true } / 404 { error }
 * - POST /api/automation/:id/trigger→ 需 ACTIVE，非激活 400 / 不存在 404
 */
describe('Automation API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/automation', automationRouter);

  const validPayload = {
    name: '测试自动化任务',
    description: '测试描述',
    prompt: '执行每日库存盘点',
    taskType: 'general',
    scheduleType: 'recurring',
    rrule: 'FREQ=DAILY',
    status: 'ACTIVE',
  };

  describe('GET /api/automation', () => {
    it('应该返回 { data, total } 结构的任务列表', async () => {
      const response = await request(app).get('/api/automation');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('POST /api/automation', () => {
    it('应该创建自动化任务（201，返回对象含 id/name）', async () => {
      const response = await request(app)
        .post('/api/automation')
        .send(validPayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', validPayload.name);
    });

    it('应该返回 400 当缺少必填字段（name/prompt/taskType）', async () => {
      const response = await request(app)
        .post('/api/automation')
        .send({ name: '仅有名称' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/automation/:id', () => {
    it('应该返回 404 当任务不存在', async () => {
      const response = await request(app).get('/api/automation/nonexistent-id');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/automation/:id', () => {
    it('应该更新自动化任务', async () => {
      const createResponse = await request(app)
        .post('/api/automation')
        .send({ ...validPayload, name: '待更新任务' });

      const id = createResponse.body.id;
      expect(id).toBeTruthy();

      const response = await request(app)
        .put(`/api/automation/${id}`)
        .send({ name: '已更新任务' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', '已更新任务');
    });

    it('应该返回 404 当更新不存在的任务', async () => {
      const response = await request(app)
        .put('/api/automation/nonexistent-id')
        .send({ name: 'x' });
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/automation/:id', () => {
    it('应该删除自动化任务（返回 { success: true }）', async () => {
      const createResponse = await request(app)
        .post('/api/automation')
        .send({ ...validPayload, name: '待删除任务' });

      const id = createResponse.body.id;
      expect(id).toBeTruthy();

      const response = await request(app).delete(`/api/automation/${id}`);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('应该返回 404 当删除不存在的任务', async () => {
      const response = await request(app).delete('/api/automation/nonexistent-id');
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/automation/:id/trigger', () => {
    it('应该返回 404 当触发不存在的任务', async () => {
      const response = await request(app).post('/api/automation/nonexistent-id/trigger');
      expect(response.status).toBe(404);
    });
  });
});
