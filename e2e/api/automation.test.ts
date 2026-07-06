import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import automationRouter from '../../server/routes/automation.js';

describe('Automation API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', automationRouter);

  describe('GET /api/automations', () => {
    it('应该返回自动化任务列表', async () => {
      const response = await request(app).get('/api/automations');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/automations', () => {
    it('应该创建自动化任务', async () => {
      const response = await request(app)
        .post('/api/automations')
        .send({
          name: '测试自动化任务',
          description: '测试描述',
          trigger: { type: 'cron', cronExpression: '0 0 * * *' },
          action: { type: 'skill', skillId: 'test-skill' },
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', '测试自动化任务');
    });

    it('应该返回 400 当缺少必填字段', async () => {
      const response = await request(app)
        .post('/api/automations')
        .send({ name: '测试任务' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/automations/:id', () => {
    it('应该返回 404 当任务不存在', async () => {
      const response = await request(app).get('/api/automations/nonexistent-id');
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/automations/:id', () => {
    it('应该更新自动化任务', async () => {
      const createResponse = await request(app)
        .post('/api/automations')
        .send({
          name: '更新测试任务',
          trigger: { type: 'cron', cronExpression: '0 0 * * *' },
          action: { type: 'skill', skillId: 'test-skill' },
        })
        .set('Content-Type', 'application/json');

      const id = createResponse.body.data.id;
      const response = await request(app)
        .put(`/api/automations/${id}`)
        .send({ name: '已更新任务' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('name', '已更新任务');
    });
  });

  describe('DELETE /api/automations/:id', () => {
    it('应该删除自动化任务', async () => {
      const createResponse = await request(app)
        .post('/api/automations')
        .send({
          name: '删除测试任务',
          trigger: { type: 'cron', cronExpression: '0 0 * * *' },
          action: { type: 'skill', skillId: 'test-skill' },
        })
        .set('Content-Type', 'application/json');

      const id = createResponse.body.data.id;
      const response = await request(app).delete(`/api/automations/${id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
    });
  });

  describe('POST /api/automations/:id/run', () => {
    it('应该手动运行自动化任务', async () => {
      const createResponse = await request(app)
        .post('/api/automations')
        .send({
          name: '运行测试任务',
          trigger: { type: 'cron', cronExpression: '0 0 * * *' },
          action: { type: 'skill', skillId: 'test-skill' },
        })
        .set('Content-Type', 'application/json');

      const id = createResponse.body.data.id;
      const response = await request(app).post(`/api/automations/${id}/run`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
    });
  });
});