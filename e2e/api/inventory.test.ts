import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import inventoryRouter from '../../server/routes/inventory.js';

describe('Inventory API E2E 测试', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRouter);
  describe('GET /api/inventory', () => {
    it('应该返回库存列表', async () => {
      const response = await request(app)
        .get('/api/inventory');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('code', 0);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('应该支持 warehouseId 过滤', async () => {
      const response = await request(app)
        .get('/api/inventory?warehouseId=test-warehouse');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('code', 0);
    });
  });

  describe('GET /api/inventory/:id', () => {
    it('应该返回 404 当库存不存在', async () => {
      const response = await request(app)
        .get('/api/inventory/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 404);
    });
  });

  describe('POST /api/inventory', () => {
    it('应该创建库存条目', async () => {
      const response = await request(app)
        .post('/api/inventory')
        .send({
          sku: 'TEST-SKU-001',
          name: '测试商品',
          quantity: 100,
          warehouseId: 'warehouse-1',
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toHaveProperty('sku', 'TEST-SKU-001');
    });

  });

  describe('PUT /api/inventory/:id', () => {
    it('应该更新库存条目', async () => {
      const createResponse = await request(app)
        .post('/api/inventory')
        .send({
          sku: 'TEST-SKU-002',
          name: '测试商品2',
          quantity: 50,
          warehouseId: 'warehouse-1',
        });

      const id = createResponse.body.data.id;

      const updateResponse = await request(app)
        .put(`/api/inventory/${id}`)
        .send({
          quantity: 200,
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body).toHaveProperty('code', 0);
      expect(updateResponse.body.data).toHaveProperty('quantity', 200);
    });

    it('应该返回 404 当库存不存在', async () => {
      const response = await request(app)
        .put('/api/inventory/nonexistent-id')
        .send({ quantity: 100 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/inventory/:id', () => {
    it('应该删除库存条目', async () => {
      const createResponse = await request(app)
        .post('/api/inventory')
        .send({
          sku: 'TEST-SKU-DELETE',
          name: '待删除商品',
          quantity: 10,
          warehouseId: 'warehouse-1',
        });

      const id = createResponse.body.data.id;

      const deleteResponse = await request(app)
        .delete(`/api/inventory/${id}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body).toHaveProperty('code', 0);
    });

    it('应该返回 404 当库存不存在', async () => {
      const response = await request(app)
        .delete('/api/inventory/nonexistent-id');

      expect(response.status).toBe(404);
    });
  });
});