import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import warehousesRouter from '../warehouses.js';

vi.mock('../../dao/warehouse.js', () => ({
  getWarehouses: vi.fn(),
  getWarehouseById: vi.fn(),
  createWarehouse: vi.fn(),
  updateWarehouse: vi.fn(),
  deleteWarehouse: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/warehouses', warehousesRouter);

describe('Warehouses Routes', () => {
  it('GET /api/warehouses returns all warehouses', async () => {
    const { getWarehouses } = await import('../../dao/warehouse.js');
    vi.mocked(getWarehouses).mockReturnValue([
      { id: '1', name: 'Main Warehouse', location: 'Beijing', warehouseType: 'normal', temperatureRange: '15-25°C' },
    ]);

    const res = await request(app).get('/api/warehouses');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/warehouses?type=cold filters by warehouse type', async () => {
    const { getWarehouses } = await import('../../dao/warehouse.js');
    vi.mocked(getWarehouses).mockReturnValue([
      { id: '2', name: 'Cold Storage', location: 'Shanghai', warehouseType: 'cold', temperatureRange: '2-8°C' },
    ]);

    const res = await request(app).get('/api/warehouses?type=cold');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].warehouseType).toBe('cold');
  });

  it('GET /api/warehouses/:id returns warehouse by id', async () => {
    const { getWarehouseById } = await import('../../dao/warehouse.js');
    vi.mocked(getWarehouseById).mockReturnValue({
      id: '1',
      name: 'Main Warehouse',
      location: 'Beijing',
    });

    const res = await request(app).get('/api/warehouses/1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('1');
  });

  it('GET /api/warehouses/:id returns 404 for missing warehouse', async () => {
    const { getWarehouseById } = await import('../../dao/warehouse.js');
    vi.mocked(getWarehouseById).mockReturnValue(undefined);

    const res = await request(app).get('/api/warehouses/999');
    expect(res.status).toBe(404);
  });

  it('POST /api/warehouses creates a warehouse', async () => {
    const { createWarehouse } = await import('../../dao/warehouse.js');
    vi.mocked(createWarehouse).mockReturnValue({
      id: '2',
      name: 'New Warehouse',
      location: 'Shanghai',
    });

    const res = await request(app)
      .post('/api/warehouses')
      .send({ name: 'New Warehouse', location: 'Shanghai' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('New Warehouse');
  });

  it('PUT /api/warehouses/:id updates a warehouse', async () => {
    const { updateWarehouse } = await import('../../dao/warehouse.js');
    vi.mocked(updateWarehouse).mockReturnValue({
      id: '1',
      name: 'Updated Warehouse',
      location: 'Beijing',
    });

    const res = await request(app)
      .put('/api/warehouses/1')
      .send({ name: 'Updated Warehouse' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Warehouse');
  });

  it('DELETE /api/warehouses/:id deletes a warehouse', async () => {
    const { deleteWarehouse } = await import('../../dao/warehouse.js');
    vi.mocked(deleteWarehouse).mockReturnValue(true);

    const res = await request(app).delete('/api/warehouses/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
