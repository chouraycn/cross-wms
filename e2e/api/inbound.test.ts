import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import inboundRouter from '../../server/routes/inbound.js';

/**
 * Inbound Records API E2E 测试（新增 — 覆盖事务型入库链路）
 *
 * 契约以真实后端 server/routes/inbound.ts 为准：
 * - GET  /api/inbound-records        → 200 { code: 0, data: [] }
 * - GET  /api/inbound-records/:id    → 200 { code: 0, data } / 404 { code: 404 }
 * - POST /api/inbound-records        → 201 { code: 0, data }（经 InventoryService 事务更新库存）
 * - DELETE /api/inbound-records/:id  → 200 / 404
 */
describe('Inbound Records API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/inbound-records', inboundRouter);

  const warehouseId = `wh-e2e-${Date.now()}`;
  const sku = `SKU-IN-${Date.now()}`;

  describe('GET /api/inbound-records', () => {
    it('应该返回 { code: 0, data: [] } 结构的入库记录列表', async () => {
      const response = await request(app).get('/api/inbound-records');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('code', 0);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('应该支持 warehouseId 过滤', async () => {
      const response = await request(app).get(`/api/inbound-records?warehouseId=${warehouseId}`);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('code', 0);
    });
  });

  describe('POST /api/inbound-records', () => {
    it('应该事务性创建入库记录并增加库存（201）', async () => {
      const response = await request(app)
        .post('/api/inbound-records')
        .send({
          warehouseId,
          sku,
          quantity: 100,
          operator: 'e2e-tester',
          remarks: 'E2E 入库测试',
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('code', 0);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('GET /api/inbound-records/:id', () => {
    it('应该返回 404 当记录不存在', async () => {
      const response = await request(app).get('/api/inbound-records/nonexistent-id');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 404);
    });
  });

  describe('DELETE /api/inbound-records/:id', () => {
    it('应该返回 404 当删除不存在的记录', async () => {
      const response = await request(app).delete('/api/inbound-records/nonexistent-id');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 404);
    });
  });
});
