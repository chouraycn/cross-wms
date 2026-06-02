/**
 * Warehouses CRUD Routes
 */
import { Router, type Request, type Response } from 'express';
import {
  getWarehouses as dbGetAll,
  getWarehouseById as dbGetById,
  createWarehouse as dbCreate,
  updateWarehouse as dbUpdate,
  deleteWarehouse as dbDelete,
} from '../db.js';

const router = Router();

// GET /api/warehouses
router.get('/', (_req: Request, res: Response) => {
  const data = dbGetAll();
  res.json({ data });
});

// GET /api/warehouses/:id
router.get('/:id', (req: Request, res: Response) => {
  const data = dbGetById(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Warehouse not found' });
    return;
  }
  res.json({ data });
});

// POST /api/warehouses
router.post('/', (req: Request, res: Response) => {
  try {
    const data = dbCreate(req.body);
    res.status(201).json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/warehouses/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ error: 'Warehouse not found' });
      return;
    }
    res.json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/warehouses/:id
router.delete('/:id', (req: Request, res: Response) => {
  const ok = dbDelete(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Warehouse not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
