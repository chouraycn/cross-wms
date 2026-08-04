/**
 * Skills API 契约测试
 *
 * 锁定 /api/skills 端点的 CRUD 契约（路由源：server/routes/skills-api.ts）：
 * - GET    /api/skills             → 200 { success, data: [] }              列表
 * - POST   /api/skills             → 200 { success, data, message }         创建
 * - GET    /api/skills/:id         → 200 { success, data } / 404            详情
 * - PUT    /api/skills/:id         → 200 { success, data, message } / 404   更新
 * - DELETE /api/skills/:id         → 200 { success, data: null, message } / 404  卸载
 * - POST   /api/skills/install     → 200 { success, data, message } / 400   安装
 *
 * 使用 supertest 直接驱动 Express app（挂载真实路由），
 * 仅校验响应格式、状态码与必要字段。
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import skillsApiRouter from '../../server/routes/skills-api.js';

describe('Skills API 契约测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/skills', skillsApiRouter);

  let createdSkillId: string;

  describe('GET /api/skills — 列表', () => {
    it('应返回 200 及 { success, data } 结构', async () => {
      const response = await request(app).get('/api/skills');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('POST /api/skills — 创建', () => {
    it('应返回 200 及创建后的技能对象', async () => {
      const response = await request(app)
        .post('/api/skills')
        .send({
          name: '契约测试技能',
          desc: 'contract-test',
          category: 'tool',
          promptTemplate: 'test prompt',
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', '契约测试技能');
      createdSkillId = response.body.data.id;
    });

    it('应返回 400 当缺少 name', async () => {
      const response = await request(app)
        .post('/api/skills')
        .send({ desc: 'no-name' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/skills/:id — 详情', () => {
    it('应返回 200 及技能详情', async () => {
      const response = await request(app).get(`/api/skills/${createdSkillId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id', createdSkillId);
    });

    it('应返回 404 当技能不存在', async () => {
      const response = await request(app).get('/api/skills/nonexistent-contract-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/skills/:id — 更新', () => {
    it('应返回 200 及更新后的技能', async () => {
      const response = await request(app)
        .put(`/api/skills/${createdSkillId}`)
        .send({ name: '契约测试技能-更新' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('应返回 404 当更新不存在的技能', async () => {
      const response = await request(app)
        .put('/api/skills/nonexistent-contract-id')
        .send({ name: 'x' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/skills/install — 安装', () => {
    it('应返回 200 及安装结果（local 源）', async () => {
      const response = await request(app)
        .post('/api/skills/install')
        .send({ source: 'local', path: '/tmp/contract-skill' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('source', 'local');
      expect(response.body.data).toHaveProperty('status', 'active');
    });

    it('应返回 400 当 source 无效', async () => {
      const response = await request(app)
        .post('/api/skills/install')
        .send({ source: 'invalid' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/skills/:id — 卸载', () => {
    it('应返回 200 及成功标记', async () => {
      const response = await request(app).delete(`/api/skills/${createdSkillId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data', null);
    });

    it('应返回 404 当卸载不存在的技能', async () => {
      const response = await request(app).delete('/api/skills/nonexistent-contract-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
    });
  });
});
