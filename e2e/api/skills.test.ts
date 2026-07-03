import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import skillsRouter from '../../server/routes/skills.js';

describe('Skills API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', skillsRouter);

  describe('GET /api/user-skills', () => {
    it('应该返回用户技能列表', async () => {
      const response = await request(app)
        .get('/api/user-skills');

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/user-skills', () => {
    it('应该创建用户技能', async () => {
      const response = await request(app)
        .post('/api/user-skills')
        .send({
          name: '测试技能',
          description: '测试技能描述',
          promptTemplate: '测试 prompt',
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', '测试技能');
    });
  });

  describe('GET /api/user-skills/:id', () => {
    it('应该返回 404 当技能不存在', async () => {
      const response = await request(app)
        .get('/api/user-skills/nonexistent-id');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/builtin-status-patches', () => {
    it('应该返回内置状态补丁', async () => {
      const response = await request(app)
        .get('/api/builtin-status-patches');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/skill-usage-stats', () => {
    it('应该返回技能使用统计', async () => {
      const response = await request(app)
        .get('/api/skill-usage-stats');

      expect(response.status).toBe(200);
    });
  });
});