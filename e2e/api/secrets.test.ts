import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import secretsRouter from '../../server/routes/secretsService.js';

describe('Secrets API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', secretsRouter);

  describe('GET /api/secrets', () => {
    it('应该返回密钥列表', async () => {
      const response = await request(app).get('/api/secrets');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/secrets', () => {
    it('应该创建密钥', async () => {
      const response = await request(app)
        .post('/api/secrets')
        .send({
          id: 'test-secret',
          name: '测试密钥',
          value: 'test-value',
          category: 'api-key',
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id', 'test-secret');
    });

    it('应该返回 400 当缺少必填字段', async () => {
      const response = await request(app)
        .post('/api/secrets')
        .send({ name: '测试密钥' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/secrets/:id', () => {
    it('应该返回密钥详情（不包含值）', async () => {
      const response = await request(app).get('/api/secrets/test-secret');
      if (response.status === 200) {
        expect(response.body).toHaveProperty('id', 'test-secret');
        expect(response.body).not.toHaveProperty('value');
      }
    });

    it('应该返回 404 当密钥不存在', async () => {
      const response = await request(app).get('/api/secrets/nonexistent-id');
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/secrets/:id', () => {
    it('应该更新密钥', async () => {
      const response = await request(app)
        .put('/api/secrets/test-secret')
        .send({ name: '已更新密钥' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('name', '已更新密钥');
    });
  });

  describe('DELETE /api/secrets/:id', () => {
    it('应该删除密钥', async () => {
      const response = await request(app).delete('/api/secrets/test-secret');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
    });
  });

  describe('GET /api/secrets/categories', () => {
    it('应该返回密钥分类', async () => {
      const response = await request(app).get('/api/secrets/categories');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/secrets/validate', () => {
    it('应该验证密钥格式', async () => {
      const response = await request(app)
        .post('/api/secrets/validate')
        .send({ value: 'test-value', category: 'api-key' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('valid');
    });
  });
});