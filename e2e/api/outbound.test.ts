import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import inboundRouter from '../../server/routes/inbound.js';
import outboundRouter from '../../server/routes/outbound.js';

/**
 * Outbound Records API E2E 测试（新增 — 覆盖事务型出库 + 库存不足回滚链路）
 *
 * 契约以真实后端 server/routes/outbound.ts 为准：
 * - GET  /api/outbound-records       → 200 { code: 0, data: [] }
 * - POST /api/outbound-records       → 201 { code: 0 } / 库存不足 400 { code: 400, message: '库存不足' }
 * - GET  /api/outbound-records/:id   → 404 { code: 404 }
 *
 * 重点验证：库存不足时事务应拒绝出库（不产生负库存）。
 */
describe('Outbound Records API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/inbound-records', inboundRouter);
  app.use('/api/outbound-records', outboundRouter);

  const warehouseId = `wh-out-e2e-${Date.now()}`;
  const sku = `SKU-OUT-${Date.now()}`;

  describe('GET /api/outbound-records', () => {
    it('应该返回 { code: 0, data: [] } 结构的出库记录列表', async () => {
      const response = await request(app).get('/api/outbound-records');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('code', 0);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('库存不足时的事务保护', () => {
    it('对不存在的 SKU 出库应返回 400 且提示商品不存在', async () => {
      const response = await request(app)
        .post('/api/outbound-records')
        .send({
          warehouseId: `${warehouseId}-empty`,
          sku: `${sku}-empty`,
          quantity: 999999,
          operator: 'e2e-tester',
          remarks: '不存在商品测试',
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 400);
      expect(String(response.body.message)).toContain('不存在');
    });
  });

  describe('完整入库→出库链路', () => {
    it('先入库 200 件，再出库 50 件应成功（201）', async () => {
      const inRes = await request(app)
        .post('/api/inbound-records')
        .send({ warehouseId, sku, quantity: 200, operator: 'e2e-tester', remarks: '备货' })
        .set('Content-Type', 'application/json');
      expect(inRes.status).toBe(201);

      const outRes = await request(app)
        .post('/api/outbound-records')
        .send({ warehouseId, sku, quantity: 50, operator: 'e2e-tester', remarks: '发货' })
        .set('Content-Type', 'application/json');

      expect(outRes.status).toBe(201);
      expect(outRes.body).toHaveProperty('code', 0);
    });

    it('出库数量超过剩余库存应返回 400 库存不足', async () => {
      const outRes = await request(app)
        .post('/api/outbound-records')
        .send({ warehouseId, sku, quantity: 10_000_000, operator: 'e2e-tester', remarks: '超量' })
        .set('Content-Type', 'application/json');

      expect(outRes.status).toBe(400);
      expect(String(outRes.body.message)).toContain('库存不足');
    });
  });

  describe('GET /api/outbound-records/:id', () => {
    it('应该返回 404 当记录不存在', async () => {
      const response = await request(app).get('/api/outbound-records/nonexistent-id');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 404);
    });
  });
});
