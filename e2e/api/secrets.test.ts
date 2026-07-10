import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import secretsRouter from '../../server/routes/secretsService.js';

/**
 * Secrets API E2E 测试
 *
 * 契约以真实后端 server/routes/secretsService.ts 为准（旧测试假设的 REST CRUD 契约并不存在，已重写）：
 * - GET  /api/secrets/list      → 200 { data, total }
 * - GET  /api/secrets/stats     → 200 { data }
 * - GET  /api/secrets/status    → 200 { data }
 * - POST /api/secrets/set       → 需 provider/key/value；缺参或非法 provider → 400
 * - POST /api/secrets/validate  → 需 provider/key → 200 { data: { exists } }
 * - DELETE /api/secrets/:id     → 不存在 → 404
 *
 * 说明：为避免污染真实密钥存储/Keychain，本套件只覆盖只读端点与参数校验分支。
 */
describe('Secrets API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/secrets', secretsRouter);

  describe('GET /api/secrets/list', () => {
    it('应该返回 { data, total } 结构的密钥列表', async () => {
      const response = await request(app).get('/api/secrets/list');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('GET /api/secrets/stats', () => {
    it('应该返回统计信息', async () => {
      const response = await request(app).get('/api/secrets/stats');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('GET /api/secrets/status', () => {
    it('应该返回管理器状态', async () => {
      const response = await request(app).get('/api/secrets/status');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('POST /api/secrets/set', () => {
    it('应该返回 400 当缺少必填字段', async () => {
      const response = await request(app)
        .post('/api/secrets/set')
        .send({ key: 'X' })
        .set('Content-Type', 'application/json');
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('应该返回 400 当 provider 非法', async () => {
      const response = await request(app)
        .post('/api/secrets/set')
        .send({ provider: 'invalid-provider', key: 'X', value: 'Y' })
        .set('Content-Type', 'application/json');
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/secrets/validate', () => {
    it('应该返回 400 当缺少 provider/key', async () => {
      const response = await request(app)
        .post('/api/secrets/validate')
        .send({ provider: 'env' })
        .set('Content-Type', 'application/json');
      expect(response.status).toBe(400);
    });

    it('应该返回 { data: { exists } } 校验结果', async () => {
      const response = await request(app)
        .post('/api/secrets/validate')
        .send({ provider: 'env', key: 'CROSSWMS_NONEXISTENT_KEY_FOR_TEST' })
        .set('Content-Type', 'application/json');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('exists');
    });
  });

  describe('DELETE /api/secrets/:id', () => {
    it('应该返回 404 当删除不存在的密钥', async () => {
      const response = await request(app).delete('/api/secrets/nonexistent-id-xyz');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
